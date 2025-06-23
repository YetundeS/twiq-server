
const diceBearStyles = [
    "adventurer-neutral", "avataaars-neutral","big-ears-neutral",
    "notionists-neutral", "pixel-art-neutral", "thumbs"
];

const getRandomAvatar = (username) => {
    const randomStyle = diceBearStyles[Math.floor(Math.random() * diceBearStyles.length)];
    return {
        avatar_url: `https://api.dicebear.com/9.x/${randomStyle}/svg?seed=${encodeURIComponent(username)}`
    };
};


module.exports = { getRandomAvatar };