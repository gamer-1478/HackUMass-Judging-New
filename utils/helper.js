function roomNumberToName(roomNumber) {
    switch (roomNumber) {
        case 1: return "S110";
        case 2: return "S131";
        case 3: return "S120";
        case 4: return "S140";
        case 5: return "N101";
        case 6: return "N155";
        default: return "Unknown Room";
    }
}

module.exports = { roomNumberToName };