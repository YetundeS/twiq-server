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
