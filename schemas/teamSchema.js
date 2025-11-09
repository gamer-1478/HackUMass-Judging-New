const { skip } = require('node:test');

const mongoose = require('mongoose'),
    reqString = { type: String, required: true },
    nonreqString = { type: String, required: false },
    reqNumber = { type: Number, required: true },
    nonreqNumber = { type: Number, required: false },
    reqBoolean = { type: Boolean, required: true, default: false },
    nonreqBoolean = { type: Boolean, required: false, default: false },
    moment = require('moment'),
    now = new Date(),
    dateStringWithTime = moment(now).format('YYYY-MM-DD HH:MM:SS');

const teamSchema = new mongoose.Schema({
    ProjectEmail: reqString,
    ProjectName: reqString,
    date: {
        type: String,
        default: dateStringWithTime
    },
    LeadName: nonreqString,
    Mem1Name: nonreqString,
    Mem1Email: nonreqString,
    Mem2Name: nonreqString,
    Mem2Email: nonreqString,
    Mem3Name: nonreqString,
    Mem3Email: nonreqString,
    Mem4Name: nonreqString,
    Mem4Email: nonreqString,
    TableNumber: nonreqNumber,
    RoomNumber: nonreqNumber,
    ProjectLink: nonreqString,
    Category: reqString,
    HardwareJudge: nonreqBoolean,
    MLH: nonreqString,
    checkin1: { type: Boolean, default: false },
    checkin2: { type: Boolean, default: false },
})

// This ensures no two checked-in teams can have the same room and table number
teamSchema.index(
    { RoomNumber: 1, TableNumber: 1 },
    {
        unique: true,
        sparse: true, // Only apply to documents where RoomNumber and TableNumber exist
        partialFilterExpression: { checkin1: true }, // Only enforce for checked-in teams
    },
)

module.exports = mongoose.model("Team", teamSchema)