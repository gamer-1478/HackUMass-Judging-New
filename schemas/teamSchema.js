const { skip } = require('node:test');

const mongoose = require('mongoose'),
    reqString = { type: String, required: true },
    nonreqString = { type: String, required: false },
    reqNumber = { type: Number, required: true },
    nonreqNumber = { type: Number, required: false },
    reqBoolean = { type: Boolean, required: true, default: false },
    nonreqBoolean = { type: Boolean, required: false },
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
    TableNumber: nonreqNumber,
    RoomNumber: nonreqNumber,
    Category: reqString,
    BegginerFriendly: nonreqBoolean,
    checkin1: { type: Boolean, default: false },
    checkin2: { type: Boolean, default: false },
    TeamMembers: { type: Array, default: [] },
})

module.exports = mongoose.model("Team", teamSchema)