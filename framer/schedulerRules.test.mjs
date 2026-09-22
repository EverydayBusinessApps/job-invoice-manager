import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import {
    buildTimeSlots,
    getEarliestBookableDate,
    isWeekday,
    isValidPhone,
    validateProposal,
    combineLocalDateTime,
    addMinutes,
    toDateInputValue,
    CALL_DURATION_MINUTES,
    buildProposalEmail,
    listBookableDates,
} from "./schedulerRules.mjs"

const slots = buildTimeSlots()

assert.deepEqual(slots[0], "09:30")
assert.deepEqual(slots[slots.length - 1], "12:10")
assert.equal(slots.length, 9)
assert.deepEqual(slots, [
    "09:30",
    "09:50",
    "10:10",
    "10:30",
    "10:50",
    "11:10",
    "11:30",
    "11:50",
    "12:10",
])
assert.equal(CALL_DURATION_MINUTES, 20)

function dateOn(year, monthIndex, day, hours = 12) {
    return new Date(year, monthIndex, day, hours, 0, 0, 0)
}

// Wednesday 22 Apr 2026 + 2 days => Friday
assert.equal(
    toDateInputValue(getEarliestBookableDate(dateOn(2026, 3, 22))),
    "2026-04-24"
)

// Thursday + 2 days is Saturday, skip to Monday
assert.equal(
    toDateInputValue(getEarliestBookableDate(dateOn(2026, 3, 23))),
    "2026-04-27"
)

// Friday + 2 days is Sunday, skip to Monday
assert.equal(
    toDateInputValue(getEarliestBookableDate(dateOn(2026, 3, 24))),
    "2026-04-27"
)

// Saturday + 2 days is Monday
assert.equal(
    toDateInputValue(getEarliestBookableDate(dateOn(2026, 3, 25))),
    "2026-04-27"
)

const bookable = listBookableDates(dateOn(2026, 3, 23), 5)
assert.deepEqual(
    bookable.map((date) => toDateInputValue(date)),
    ["2026-04-27", "2026-04-28", "2026-04-29", "2026-04-30", "2026-05-01"]
)
assert.ok(bookable.every((date) => isWeekday(date)))

assert.equal(isWeekday(dateOn(2026, 3, 24)), true)
assert.equal(isWeekday(dateOn(2026, 3, 25)), false)
assert.equal(isWeekday(dateOn(2026, 3, 26)), false)

assert.equal(isValidPhone("+353 86 123 4567"), true)
assert.equal(isValidPhone("0861234567"), true)
assert.equal(isValidPhone("123"), false)
assert.equal(isValidPhone("call me"), false)

const now = dateOn(2026, 3, 22, 9)
const valid = {
    dateValue: "2026-04-24",
    timeValue: "10:30",
    phone: "+353861234567",
    details: "Need help with a local service website.",
    now,
}

assert.deepEqual(validateProposal(valid), {})

assert.ok(validateProposal({ ...valid, dateValue: "2026-04-23" }).date)
assert.ok(validateProposal({ ...valid, dateValue: "2026-04-25" }).date)
assert.ok(validateProposal({ ...valid, timeValue: "09:00" }).time)
assert.ok(validateProposal({ ...valid, timeValue: "13:00" }).time)
assert.ok(validateProposal({ ...valid, phone: "" }).phone)
assert.ok(validateProposal({ ...valid, details: "   " }).details)

const start = combineLocalDateTime("2026-04-24", "12:30")
assert.ok(start)
const end = addMinutes(start, 20)
assert.equal(end.getHours(), 12)
assert.equal(end.getMinutes(), 50)

const email = buildProposalEmail({
    ...valid,
    meeting: "coffee",
})
assert.ok(email.body.includes("20-minute"))
assert.ok(email.body.includes("+353861234567"))
assert.ok(email.body.includes("Coffee nearby"))
assert.ok(email.body.includes("Need help with a local service website."))
assert.ok(email.body.includes("calendar.google.com"))
assert.ok(email.calendarUrl.includes("20260424T103000"))
assert.ok(email.calendarUrl.includes("20260424T105000"))

const tsx = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "CallProposalScheduler.tsx"),
    "utf8"
)
assert.match(tsx, /const SLOT_START_MINUTES = 9 \* 60 \+ 30/)
assert.match(tsx, /const SLOT_END_MINUTES = 12 \* 60 \+ 30/)
assert.match(tsx, /const SLOT_STEP_MINUTES = 20/)
assert.match(tsx, /const CALL_DURATION_MINUTES = 20/)
assert.match(tsx, /const MIN_LEAD_DAYS = 2/)
assert.match(tsx, /type="tel"/)
assert.match(tsx, /call-proposal-details/)
assert.match(tsx, /Monday to Friday/)
assert.match(tsx, /Choose a weekday/)
assert.match(tsx, /mins \+ CALL_DURATION_MINUTES <= SLOT_END_MINUTES/)
assert.match(tsx, /const DROPDOWN_BACKGROUND = "#102A43"/)
assert.match(tsx, /function DarkSelect/)

console.log("schedulerRules tests passed")
