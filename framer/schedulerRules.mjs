/** Shared booking rules for the Call Proposal Scheduler. Keep in sync with CallProposalScheduler.tsx. */

export const SLOT_START_MINUTES = 9 * 60 + 30
export const SLOT_END_MINUTES = 12 * 60 + 30
export const SLOT_STEP_MINUTES = 20
export const CALL_DURATION_MINUTES = 20
export const MIN_LEAD_DAYS = 2
export const DETAILS_MAX_LENGTH = 800

export const MEETING_OPTIONS = [
    { value: "phone", label: "Phone call" },
    { value: "coffee", label: "Coffee nearby, if I'm local" },
]

export function minutesToTimeLabel(mins) {
    const hours = Math.floor(mins / 60)
    const minutes = mins % 60
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`
}

export function buildTimeSlots(
    startMinutes = SLOT_START_MINUTES,
    endMinutes = SLOT_END_MINUTES,
    stepMinutes = SLOT_STEP_MINUTES,
    durationMinutes = CALL_DURATION_MINUTES
) {
    const slots = []
    for (
        let mins = startMinutes;
        mins + durationMinutes <= endMinutes;
        mins += stepMinutes
    ) {
        slots.push(minutesToTimeLabel(mins))
    }
    return slots
}

export function isWeekday(date) {
    const day = date.getDay()
    return day >= 1 && day <= 5
}

export function startOfLocalDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function addLocalDays(date, days) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

export function getEarliestBookableDate(now, minLeadDays = MIN_LEAD_DAYS) {
    let date = addLocalDays(startOfLocalDay(now), minLeadDays)
    while (!isWeekday(date)) {
        date = addLocalDays(date, 1)
    }
    return date
}

export function listBookableDates(now, count = 20, minLeadDays = MIN_LEAD_DAYS) {
    const dates = []
    let date = getEarliestBookableDate(now, minLeadDays)
    while (dates.length < count) {
        if (isWeekday(date)) {
            dates.push(new Date(date.getFullYear(), date.getMonth(), date.getDate()))
        }
        date = addLocalDays(date, 1)
    }
    return dates
}

export function formatDateOptionLabel(date) {
    return new Intl.DateTimeFormat(undefined, {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
    }).format(date)
}

export function toDateInputValue(date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, "0")
    const day = String(date.getDate()).padStart(2, "0")
    return `${year}-${month}-${day}`
}

export function parseLocalDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""))
    if (!match) return null
    const year = Number(match[1])
    const month = Number(match[2]) - 1
    const day = Number(match[3])
    const date = new Date(year, month, day)
    if (
        date.getFullYear() !== year ||
        date.getMonth() !== month ||
        date.getDate() !== day
    ) {
        return null
    }
    return date
}

export function parseTimeLabel(value) {
    const match = /^(\d{2}):(\d{2})$/.exec(String(value || ""))
    if (!match) return null
    return { hours: Number(match[1]), minutes: Number(match[2]) }
}

export function combineLocalDateTime(dateValue, timeValue) {
    const date = parseLocalDate(dateValue)
    const time = parseTimeLabel(timeValue)
    if (!date || !time) return null
    return new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        time.hours,
        time.minutes,
        0,
        0
    )
}

export function addMinutes(date, minutes) {
    return new Date(date.getTime() + minutes * 60 * 1000)
}

export function isValidPhone(value) {
    const trimmed = String(value || "").trim()
    if (!trimmed) return false
    if (!/^[+]?[\d\s().-]{7,22}$/.test(trimmed)) return false
    const digits = trimmed.replace(/\D/g, "")
    return digits.length >= 7 && digits.length <= 15
}

export function validateProposal({
    dateValue,
    timeValue,
    phone,
    details,
    now,
    slots = buildTimeSlots(),
    minLeadDays = MIN_LEAD_DAYS,
} = {}) {
    const errors = {}
    const earliest = getEarliestBookableDate(now || new Date(), minLeadDays)
    const date = parseLocalDate(dateValue)

    if (!date) {
        errors.date = "Please choose a weekday at least 2 days ahead."
    } else if (!isWeekday(date)) {
        errors.date = "Please choose a weekday (Monday to Friday)."
    } else if (startOfLocalDay(date) < earliest) {
        errors.date = "Please choose a date at least 2 days ahead."
    }

    if (!timeValue || !slots.includes(timeValue)) {
        errors.time = "Please choose a 20-minute slot between 9:30 and 12:30."
    }

    if (!isValidPhone(phone)) {
        errors.phone = "Please add a phone number so Jane can call you."
    }

    if (!String(details || "").trim()) {
        errors.details =
            "Please add a short note about your business or what you need help with."
    }

    return errors
}

export function formatFriendlyRange(start, durationMinutes = CALL_DURATION_MINUTES) {
    const end = addMinutes(start, durationMinutes)
    const startLabel = new Intl.DateTimeFormat(undefined, {
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
    }).format(start)
    const endLabel = new Intl.DateTimeFormat(undefined, {
        hour: "numeric",
        minute: "2-digit",
    }).format(end)
    return `${startLabel} – ${endLabel} (${durationMinutes} minutes)`
}

export function toCalendarStamp(date) {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, "0")
    const day = String(date.getDate()).padStart(2, "0")
    const hours = String(date.getHours()).padStart(2, "0")
    const minutes = String(date.getMinutes()).padStart(2, "0")
    return `${year}${month}${day}T${hours}${minutes}00`
}

export function meetingLabel(value) {
    const match = MEETING_OPTIONS.find((option) => option.value === value)
    return match ? match.label : MEETING_OPTIONS[0].label
}

export function buildGoogleCalendarUrl({ title, start, end, details }) {
    const params = new URLSearchParams({
        action: "TEMPLATE",
        text: title,
        dates: `${toCalendarStamp(start)}/${toCalendarStamp(end)}`,
        details,
    })
    return `https://calendar.google.com/calendar/render?${params.toString()}`
}

export function buildProposalEmail({
    dateValue,
    timeValue,
    phone,
    details,
    meeting = "phone",
    durationMinutes = CALL_DURATION_MINUTES,
}) {
    const start = combineLocalDateTime(dateValue, timeValue)
    if (!start) return null
    const end = addMinutes(start, durationMinutes)
    const whenLabel = formatFriendlyRange(start, durationMinutes)
    const meetingText = meetingLabel(meeting)
    const trimmedDetails = String(details || "").trim()
    const calendarDetails = [
        `Phone: ${String(phone || "").trim()}`,
        `Meeting: ${meetingText}`,
        `Duration: ${durationMinutes} minutes`,
        "",
        trimmedDetails,
        "",
        "Proposed local time from the visitor. Please confirm by email.",
    ].join("\n")
    const calendarUrl = buildGoogleCalendarUrl({
        title: "Proposed 20-minute digital journey call",
        start,
        end,
        details: calendarDetails,
    })
    const body = [
        "Hi Jane,",
        "",
        "I'd like to propose a 20-minute no-cost digital journey call.",
        "",
        `Proposed local date and time: ${whenLabel}`,
        `Phone number: ${String(phone || "").trim()}`,
        `Meeting preference: ${meetingText}`,
        "",
        "About my business / what I need help with:",
        trimmedDetails,
        "",
        "Please follow up with a confirmation email and calendar booking. I'm expecting a phone call rather than an online meeting, or coffee nearby if I'm local.",
        "",
        `Calendar draft: ${calendarUrl}`,
        "",
        "Thanks!",
    ].join("\n")

    return {
        start,
        end,
        whenLabel,
        subject: "Proposed time for a no-cost digital journey call",
        body,
        calendarUrl,
    }
}

export function buildMailtoUrl(emailAddress, proposal) {
    const subject = encodeURIComponent(proposal.subject)
    const body = encodeURIComponent(proposal.body)
    return `mailto:${emailAddress}?subject=${subject}&body=${body}`
}
