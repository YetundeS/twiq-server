
const diceBearStyles = [
    "adventurer", "adventurer-neutral", "avataaars", "avataaars-neutral",
    "big-ears", "big-ears-neutral", "big-smile", "bottts", "bottts-neutral",
    "croodles", "croodles-neutral", "dylan", "fun-emoji", "glass", "icons",
    "identicon", "initials", "lorelei", "lorelei-neutral", "micah", "miniavs",
    "notionists", "notionists-neutral", "open-peeps", "personas", "pixel-art",
    "pixel-art-neutral", "rings", "shapes", "thumbs"
];

const getRandomAvatar = (username) => {
    const randomStyle = diceBearStyles[Math.floor(Math.random() * diceBearStyles.length)];
    return {
        avatar_url: `https://api.dicebear.com/7.x/${randomStyle}/svg?seed=${encodeURIComponent(username)}`
    };
};


module.exports = { getRandomAvatar };