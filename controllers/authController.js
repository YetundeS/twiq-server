const supabase = require("../config/supabaseClient");

const { getUserByAuthId, validateForm } = require("../utils/getUserByAuthId");
const { getRandomAvatar } = require("../services/authService")

const exempted_role = [
    "admin",
    "developer"
]


// User Signup
exports.signup = async (req, res) => {
    const { organization_name, email, user_name, password } = req.body;

    // Ensure the user_name is not "admin"
    if (exempted_role.includes(user_name.toLowerCase())) {
        return res.status(400).json({ error: `Username ${user_name} is not allowed.` });
    }

    const validationError = validateForm({ organization_name, email, user_name, password });

    if (validationError) {
        return res.status(400).json({ error: validationError });
    }

    try {
        // Check if email already exists
        const { data: existingUser, error: fetchError } = await supabase
            .from("profiles")
            .select("email")
            .eq("email", email)
            .single();

        if (fetchError && fetchError.code !== "PGRST116") {
            // PGRST116: No rows found (safe to ignore)
            return res.status(500).json({ error: "Error checking email existence. Try again later." });
        }

        if (existingUser) {
            return res.status(400).json({ error: "Email already in use. Please log in or use a different email." });
        }

        // Create Auth-User
        const { data, error } = await supabase.auth.signUp({ email, password });

        if (error) {
            return res.status(400).json({ error: error.message });
        }

        if (data?.user) {
            // Generate random avatar
            const { avatar_url } = getRandomAvatar(user_name);

            // Create user profile
            const { error: profileError } = await supabase.from("profiles").insert({
                auth_id: data.user.id,
                user_name: user_name,
                email: data.user.email,
                avatar_url: avatar_url,
                organization_name
            });

            if (profileError) {
                return res.status(500).json({ error: profileError });
            }
        }

        return res.status(201).json({ message: "Signup successful. Please verify your email." });
    } catch (err) {
        console.error("Signup error:", err);
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
        const errorMessage = error.message.toLowerCase();

        // 🔁 Auto-resend confirmation email if not confirmed
        if (errorMessage.includes('email not confirmed')) {
            const { error: resendError } = await supabase.auth.resend({
                type: 'signup',
                email,
                options: {
                    emailRedirectTo: 'http://twiq.vercel.app//auth'
                }
            });

            if (resendError) {
                return res.status(400).json({
                    error: 'Failed to resend confirmation email. ' + resendError.message
                });
            }

            return res.status(400).json({
                error: 'Email not confirmed. A new confirmation email has been sent.'
            });
        }

        return res.status(400).json({ error: error.message });
    }

    let user = await getUserByAuthId(data?.user?.id);

    // Send the access_token in the response body instead of a cookie
    return res.status(200).json({
        message: 'Login successful.',
        user,
        access_token: data.session.access_token // Send token to frontend
    });
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
        console.log('LogOut error - ', err)
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