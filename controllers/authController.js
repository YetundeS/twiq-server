

const { getUserByAuthId, validateForm } = require("../utils/getUserByAuthId");
const logger = require('../utils/logger');
const { getRandomAvatar } = require("../services/authService")
const { v4: uuidv4 } = require("uuid");
const stripe = require("../config/stripeClient");
const { supabase, supabaseAdmin } = require("../config/supabaseClient");
const confirmEmailTemplate = require("../emails/templates/confirmEmail");
const resend = require("../config/resendClient");

const exempted_role = [
    "admin",
    "developer"
]


// User Signup
exports.signup = async (req, res) => {
  const { organization_name, email, user_name, password } = req.body;

  if (exempted_role.includes(user_name.toLowerCase())) {
    return res
      .status(400)
      .json({ error: `Username ${user_name} is not allowed.` });
  }

  const validationError = validateForm({
    organization_name,
    email,
    user_name,
    password,
  });

  if (validationError) {
    return res.status(400).json({ error: validationError });
  }

  try {
    const { data: existingUser, error: fetchError } = await supabase
      .from("profiles")
      .select("email")
      .eq("email", email)
      .single();

    if (fetchError && fetchError.code !== "PGRST116") {
      return res
        .status(500)
        .json({ error: "Error checking email existence. Try again later." });
    }

    if (existingUser) {
      return res.status(400).json({
        error: "Email already in use. Please log in or use a different email.",
      });
    }

    const { data: signupData, error: signupError } = await supabase.auth.signUp({ email, password });

    if (signupError) {
      return res.status(400).json({ error: signupError.message });
    }

    if (signupData?.user) {
      const { avatar_url } = getRandomAvatar(user_name);
      const token = uuidv4();

      const { error: profileError } = await supabase.from("profiles").insert({
        auth_id: signupData.user.id,
        user_name,
        email: signupData.user.email,
        avatar_url,
        organization_name,
        email_verification_token: token,
        email_confirmed: false,
      });

      if (profileError) {
        return res.status(500).json({ error: profileError.message });
      }

      const { subject, html } = confirmEmailTemplate({
        name: user_name,
        confirmationUrl: `https://app.twiq.ai/verify-email?token=${token}`,
      });

      await resend.emails.send({
        from: "Tope from TWIQ <team@mail.twiq.ai>",
        to: email,
        subject,
        html,
      });

      // ⚠️ Attempt auto-login
      const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (loginError) {
        return res.status(400).json({ error: loginError.message });
      }

      if (!loginData.session) {
        return res.status(400).json({
          error: "No session returned. Please verify your email to continue.",
        });
      }

      const user = await getUserByAuthId(loginData?.user?.id);

      if (user?.error) {
        return res.status(400).json({ error: "Error fetching user." });
      }

      const { access_token, refresh_token } = loginData.session;

      return res.status(200).json({
        message: "Signup and login successful.",
        user,
        access_token,
        refresh_token,
      });
    }

    return res.status(500).json({ error: "Something went wrong during signup." });
  } catch (err) {
    logger.logSystemError('User signup failed', err, { email, user_name });
    return res.status(500).json({ error: "Internal server error." });
  }
};


// User Login
exports.login = async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
        return res.status(400).json({ error: error.message });
    }

    let user = await getUserByAuthId(data?.user?.id);

    if (user?.error || !user) {
        return res.status(400).json({ error: 'Error fetching user.' });
    }

    // ❌ Block deleted accounts from logging in
    if (user.is_deleted) {
        return res.status(403).json({
            error: 'Your account has been deactivated. Contact support for assistance.',
        });
    }

    // Check admin status from database only
    // The is_admin field from the database is the single source of truth
    const isAdmin = user.is_admin === true;

    // Include admin status in user object for frontend
    user.is_admin = isAdmin;

    // ✅ Return both tokens
    const { access_token, refresh_token } = data.session;

    return res.status(200).json({
        message: 'Login successful.',
        user,
        access_token,
        refresh_token,
    });
};



exports.resendEmailConfirmation = async (req, res) => {
  const user = req.user;

  if (!user?.id || !user?.email || !user?.user_name) {
    return res.status(400).json({ error: "Incomplete user information." });
  }

  try {
    // 1. Generate a new token
    const newToken = uuidv4();

    // 2. Update token in DB
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ email_verification_token: newToken })
      .eq("id", user.id);

    if (updateError) {
      logger.logSystemError('Email verification token update failed', updateError, { userId: user.id });
      return res.status(500).json({ error: "Could not update verification token." });
    }

    // 3. Create email content
    const { subject, html } = confirmEmailTemplate({
      name: user.user_name,
      confirmationUrl: `https://app.twiq.ai/verify-email?token=${newToken}`,
    });

    // 4. Send email via Resend
    await resend.emails.send({
      from: "Tope from TWIQ <team@mail.twiq.ai>",
      to: user.email,
      subject,
      html,
    });

    return res.status(200).json({ message: "Confirmation email sent." });
  } catch (err) {
    logger.logSystemError('Resend email verification failed', err, { userId: user?.id, email: user?.email });
    return res.status(500).json({ error: "Failed to resend confirmation email." });
  }
};


exports.verifyEmailToken = async (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ error: "Token is required." });
  }

  try {
    // Find profile with matching token
    const { data: profile, error: fetchError } = await supabase
      .from("profiles")
      .select("id, email_confirmed, email_verification_token")
      .eq("email_verification_token", token)
      .single();

    if (fetchError || !profile) {
      return res.status(404).json({ error: "Invalid or expired token." });
    }

    if (profile.email_confirmed) {
      return res.status(200).json({ message: "Email already confirmed." });
    }

    // Update the user's profile
    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        email_confirmed: true,
        email_verification_token: null,
      })
      .eq("id", profile.id);

    if (updateError) {
      return res.status(500).json({ error: "Failed to confirm email." });
    }

    return res.status(200).json({ message: "Email confirmed successfully." });
  } catch (err) {
    logger.logSystemError('Email verification failed', err, { token });
    return res.status(500).json({ error: "Internal server error." });
  }
};




// logout 
exports.logout = async (req, res) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(400).json({ error: "No token provided." });
    }

    const token = authHeader.split(" ")[1];

    try {
        // Call Supabase to sign out the user
        const { error } = await supabase.auth.signOut(token);

        if (error) {
            return res.status(500).json({ error: "Failed to logout. Try again." });
        }

        return res.status(200).json({ message: "Logout successful." });
    } catch (err) {
        logger.logSystemError('User logout failed', err, { authHeader });
        return res.status(500).json({ error: "Internal server error." });
    }
};

// Password Reset Request
exports.resetPassword = async (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ error: 'Email is required.' });
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${process.env.RESET_PASS_REDIRECT_URL}`,
    })


    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json({ message: 'Password reset email sent.' });
};



// fetch user
exports.getUser = async (req, res) => {
    return res.status(200).json({ user: req.user });
};


exports.uploadProfilePicture = async (req, res) => {
    try {
        const userId = req.user?.id;
        const file = req.file;

        if (!file || !userId) {
            return res.status(400).json({ error: "Missing file or user" });
        }

        const fileName = `${uuidv4()}_${file.originalname}`;
        const filePath = `avatar/${userId}/${fileName}`; // No "private/" needed

        const { error: uploadError } = await supabase.storage
            .from("avatar")
            .upload(filePath, file.buffer, {
                contentType: file.mimetype,
                upsert: true,
            });

        if (uploadError) {
            return res.status(500).json({ error: "Upload failed", details: uploadError });
        }

        const { data: publicUrlData } = supabase.storage
            .from("avatar")
            .getPublicUrl(filePath);

        const avatarUrl = publicUrlData?.publicUrl;

        const { error: updateError } = await supabase
            .from("profiles")
            .update({ avatar_url: avatarUrl })
            .eq("id", userId);

        if (updateError) {
            return res.status(500).json({ error: "Could not update profile", details: updateError });
        }

        return res.status(200).json({ avatar_url: avatarUrl });
    } catch (err) {
        return res.status(500).json({ error: "Unexpected server error", message: err.message });
    }
};



exports.softDeleteAccount = async (req, res) => {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(400).json({ error: 'Missing user ID.' });
  }

  try {
    // 1. Fetch stripe_customer_id
    const { data: profileData, error: fetchProfileError } = await supabase
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', userId)
      .single();

    if (fetchProfileError) throw new Error("Failed to fetch profile");
    const stripeCustomerId = profileData?.stripe_customer_id;

    // 2. Cancel Stripe subscriptions
    if (stripeCustomerId) {
      const subscriptions = await stripe.subscriptions.list({ customer: stripeCustomerId });
      for (const sub of subscriptions.data) {
        await stripe.subscriptions.cancel(sub.id);
      }
    }

    // 3. Soft delete: mark as deleted and log timestamp
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        is_deleted: true,
        deleted_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (updateError) throw new Error("Failed to update profile");

    return res.status(200).json({ message: 'Account scheduled for deletion in 1 year.' });
  } catch (error) {
    logger.logSystemError('Account soft delete failed', error, { userId });
    return res.status(500).json({ error: error.message || "Internal server error." });
  }
};
