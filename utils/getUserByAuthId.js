const supabase = require("../config/supabaseClient"); // Ensure you import Supabase

const getUserByAuthId = async (auth_id) => {
    if (!auth_id) {
        return { error: "Auth ID is required." };
    }

    try {
        const { data, error } = await supabase
            .from("profiles")
            .select("*") // Select all fields or specify the needed ones (e.g., "id, email, name")
            .eq("auth_id", auth_id) // Assuming `id` is the `auth_id` in the profiles table
            .single(); // Fetch a single user

        if (error) {
            return { error: error.message };
        }

        return data;
    } catch (err) {
        console.error("Error fetching user:", err);
        return { error: "Internal server error." };
    }
};

module.exports = { getUserByAuthId };


const validateForm = (formData) => {
    let validationError = "";
    if (!formData.user_name) validationError = "Username is required";
    if (!formData.organization_name) validationError = "The name of your organization is required";
    if (!formData.email) {
      validationError = "Email is required";
    }
    if (!formData.password) {
      validationError = "Password is required";
    } else if (formData.password.length < 6) {
      validationError = "Password must be at least 6 characters";
    }
    return validationError;
  };

module.exports = { getUserByAuthId, validateForm };