import {
    useCallback,
    useEffect,
    useMemo,
    useState,
    startTransition,
    type CSSProperties,
    type ChangeEvent,
    type FormEvent,
} from "react"
import { addPropertyControls, ControlType } from "framer"

// Paste this file into a Framer code component on the Work With Me page.
// Booking rules: Mon–Fri only, 09:30–12:30 in 20-minute slots, at least 2 days ahead.
// Keep these helpers in sync with framer/schedulerRules.mjs.

const SLOT_START_MINUTES = 9 * 60 + 30
const SLOT_END_MINUTES = 12 * 60 + 30
const SLOT_STEP_MINUTES = 20
const CALL_DURATION_MINUTES = 20
const MIN_LEAD_DAYS = 2
const DETAILS_MAX_LENGTH = 800

const MEETING_OPTIONS = [
    { value: "phone", label: "Phone call" },
    { value: "coffee", label: "Coffee nearby, if I'm local" },
] as const

type MeetingValue = (typeof MEETING_OPTIONS)[number]["value"]

interface MyComponentProps {
    emailAddress: string
    helperText: string
    primaryLabel: string
    directEmailLabel: string
    dateLabel: string
    timeLabel: string
    phoneLabel: string
    detailsLabel: string
    meetingLabel: string
    surfaceColor: string
    textColor: string
    accentColor: string
    borderRadius: number
}

interface FieldErrors {
    date?: string
    time?: string
    phone?: string
    details?: string
}

function minutesToTimeLabel(mins: number): string {
    const hours = Math.floor(mins / 60)
    const minutes = mins % 60
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`
}

function buildTimeSlots(): string[] {
    const slots: string[] = []
    for (
        let mins = SLOT_START_MINUTES;
        mins <= SLOT_END_MINUTES;
        mins += SLOT_STEP_MINUTES
    ) {
        slots.push(minutesToTimeLabel(mins))
    }
    return slots
}

function isWeekday(date: Date): boolean {
    const day = date.getDay()
    return day >= 1 && day <= 5
}

function startOfLocalDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function addLocalDays(date: Date, days: number): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

function getEarliestBookableDate(now: Date, minLeadDays = MIN_LEAD_DAYS): Date {
    let date = addLocalDays(startOfLocalDay(now), minLeadDays)
    while (!isWeekday(date)) {
        date = addLocalDays(date, 1)
    }
    return date
}

function toDateInputValue(date: Date): string {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, "0")
    const day = String(date.getDate()).padStart(2, "0")
    return `${year}-${month}-${day}`
}

function parseLocalDate(value: string): Date | null {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
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

function parseTimeLabel(value: string): { hours: number; minutes: number } | null {
    const match = /^(\d{2}):(\d{2})$/.exec(value)
    if (!match) return null
    return { hours: Number(match[1]), minutes: Number(match[2]) }
}

function combineLocalDateTime(dateValue: string, timeValue: string): Date | null {
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

function addMinutes(date: Date, minutes: number): Date {
    return new Date(date.getTime() + minutes * 60 * 1000)
}

function isValidPhone(value: string): boolean {
    const trimmed = value.trim()
    if (!trimmed) return false
    if (!/^[+]?[\d\s().-]{7,22}$/.test(trimmed)) return false
    const digits = trimmed.replace(/\D/g, "")
    return digits.length >= 7 && digits.length <= 15
}

function meetingLabel(value: string): string {
    const match = MEETING_OPTIONS.find((option) => option.value === value)
    return match ? match.label : MEETING_OPTIONS[0].label
}

function formatFriendlyRange(start: Date, durationMinutes = CALL_DURATION_MINUTES): string {
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

function toCalendarStamp(date: Date): string {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, "0")
    const day = String(date.getDate()).padStart(2, "0")
    const hours = String(date.getHours()).padStart(2, "0")
    const minutes = String(date.getMinutes()).padStart(2, "0")
    return `${year}${month}${day}T${hours}${minutes}00`
}

function buildGoogleCalendarUrl(options: {
    title: string
    start: Date
    end: Date
    details: string
}): string {
    const params = new URLSearchParams({
        action: "TEMPLATE",
        text: options.title,
        dates: `${toCalendarStamp(options.start)}/${toCalendarStamp(options.end)}`,
        details: options.details,
    })
    return `https://calendar.google.com/calendar/render?${params.toString()}`
}

function validateProposal(options: {
    dateValue: string
    timeValue: string
    phone: string
    details: string
    now: Date
    slots: string[]
}): FieldErrors {
    const errors: FieldErrors = {}
    const earliest = getEarliestBookableDate(options.now)
    const date = parseLocalDate(options.dateValue)

    if (!date) {
        errors.date = "Please choose a weekday at least 2 days ahead."
    } else if (!isWeekday(date)) {
        errors.date = "Please choose a weekday (Monday to Friday)."
    } else if (startOfLocalDay(date) < earliest) {
        errors.date = "Please choose a date at least 2 days ahead."
    }

    if (!options.timeValue || !options.slots.includes(options.timeValue)) {
        errors.time = "Please choose a 20-minute slot between 9:30 and 12:30."
    }

    if (!isValidPhone(options.phone)) {
        errors.phone = "Please add a phone number so Jane can call you."
    }

    if (!options.details.trim()) {
        errors.details =
            "Please add a short note about your business or what you need help with."
    }

    return errors
}

function firstError(errors: FieldErrors): string {
    return errors.date || errors.time || errors.phone || errors.details || ""
}

function hexLuminance(hex: string): number {
    const raw = hex.replace("#", "")
    if (raw.length !== 6) return 0
    const r = parseInt(raw.slice(0, 2), 16)
    const g = parseInt(raw.slice(2, 4), 16)
    const b = parseInt(raw.slice(4, 6), 16)
    return (r * 299 + g * 587 + b * 114) / 1000
}

function buildProposalEmail(options: {
    dateValue: string
    timeValue: string
    phone: string
    details: string
    meeting: MeetingValue
}): { subject: string; body: string } | null {
    const start = combineLocalDateTime(options.dateValue, options.timeValue)
    if (!start) return null
    const end = addMinutes(start, CALL_DURATION_MINUTES)
    const whenLabel = formatFriendlyRange(start)
    const meetingText = meetingLabel(options.meeting)
    const trimmedDetails = options.details.trim()
    const calendarDetails = [
        `Phone: ${options.phone.trim()}`,
        `Meeting: ${meetingText}`,
        `Duration: ${CALL_DURATION_MINUTES} minutes`,
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
        `Phone number: ${options.phone.trim()}`,
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
        subject: "Proposed time for a no-cost digital journey call",
        body,
    }
}

function fieldStyle(
    accentColor: string,
    textColor: string,
    borderRadius: number,
    inputBackground: string,
    extra?: CSSProperties
): CSSProperties {
    return {
        width: "100%",
        boxSizing: "border-box",
        borderRadius: Math.max(12, Math.min(16, borderRadius)),
        border: `1px solid ${accentColor}`,
        background: inputBackground,
        color: textColor,
        padding: "10px 12px",
        outline: "none",
        fontFamily: "inherit",
        fontSize: 14,
        ...extra,
    }
}

/**
 * @framerSupportedLayoutWidth any-prefer-fixed
 * @framerSupportedLayoutHeight auto
 */
export default function CallProposalScheduler(props: MyComponentProps) {
    const {
        emailAddress,
        helperText,
        primaryLabel,
        directEmailLabel,
        dateLabel,
        timeLabel,
        phoneLabel,
        detailsLabel,
        meetingLabel: meetingFieldLabel,
        surfaceColor,
        textColor,
        accentColor,
        borderRadius,
    } = props

    const slots = useMemo(() => buildTimeSlots(), [])
    const [selectedDate, setSelectedDate] = useState("")
    const [selectedTime, setSelectedTime] = useState("")
    const [phone, setPhone] = useState("")
    const [meeting, setMeeting] = useState<MeetingValue>("phone")
    const [details, setDetails] = useState("")
    const [errors, setErrors] = useState<FieldErrors>({})
    const [nowMs, setNowMs] = useState(() => Date.now())

    useEffect(() => {
        if (typeof window === "undefined") return
        const timer = window.setInterval(() => {
            startTransition(() => setNowMs(Date.now()))
        }, 60 * 1000)

        return () => {
            window.clearInterval(timer)
        }
    }, [])

    const minimumDate = useMemo(() => {
        return toDateInputValue(getEarliestBookableDate(new Date(nowMs)))
    }, [nowMs])

    const lightSurface = hexLuminance(surfaceColor) > 160
    const inputBackground = lightSurface
        ? "rgba(16, 42, 67, 0.06)"
        : "rgba(255,255,255,0.08)"
    const errorColor = lightSurface ? "#9B1C1C" : "#ffdfdf"
    const buttonText = lightSurface ? "#102A43" : surfaceColor

    const clearFieldError = useCallback((key: keyof FieldErrors) => {
        startTransition(() => {
            setErrors((current) => {
                if (!current[key]) return current
                const next = { ...current }
                delete next[key]
                return next
            })
        })
    }, [])

    const handleDateChange = useCallback(
        (event: ChangeEvent<HTMLInputElement>) => {
            const value = event.target.value
            startTransition(() => setSelectedDate(value))
            clearFieldError("date")
        },
        [clearFieldError]
    )

    const handleTimeChange = useCallback(
        (event: ChangeEvent<HTMLSelectElement>) => {
            const value = event.target.value
            startTransition(() => setSelectedTime(value))
            clearFieldError("time")
        },
        [clearFieldError]
    )

    const handlePhoneChange = useCallback(
        (event: ChangeEvent<HTMLInputElement>) => {
            const value = event.target.value
            startTransition(() => setPhone(value))
            clearFieldError("phone")
        },
        [clearFieldError]
    )

    const handleMeetingChange = useCallback(
        (event: ChangeEvent<HTMLSelectElement>) => {
            const value = event.target.value as MeetingValue
            startTransition(() => setMeeting(value))
        },
        []
    )

    const handleDetailsChange = useCallback(
        (event: ChangeEvent<HTMLTextAreaElement>) => {
            const value = event.target.value
            startTransition(() => setDetails(value))
            clearFieldError("details")
        },
        [clearFieldError]
    )

    const handleSubmit = useCallback(
        (event: FormEvent<HTMLFormElement>) => {
            event.preventDefault()

            const nextErrors = validateProposal({
                dateValue: selectedDate,
                timeValue: selectedTime,
                phone,
                details,
                now: new Date(nowMs),
                slots,
            })

            if (Object.keys(nextErrors).length > 0) {
                startTransition(() => setErrors(nextErrors))
                return
            }

            const proposal = buildProposalEmail({
                dateValue: selectedDate,
                timeValue: selectedTime,
                phone,
                details,
                meeting,
            })
            if (!proposal) {
                startTransition(() =>
                    setErrors({
                        date: "Please choose a valid weekday and time slot.",
                    })
                )
                return
            }

            const mailtoUrl = `mailto:${emailAddress}?subject=${encodeURIComponent(
                proposal.subject
            )}&body=${encodeURIComponent(proposal.body)}`

            if (typeof window !== "undefined") {
                window.location.href = mailtoUrl
            }
        },
        [
            details,
            emailAddress,
            meeting,
            nowMs,
            phone,
            selectedDate,
            selectedTime,
            slots,
        ]
    )

    const dateId = "call-proposal-date"
    const timeId = "call-proposal-time"
    const phoneId = "call-proposal-phone"
    const meetingId = "call-proposal-meeting"
    const detailsId = "call-proposal-details"
    const errorId = "call-proposal-error"
    const helperId = "call-proposal-helper"
    const alertText = firstError(errors)
    const controlStyle = fieldStyle(
        accentColor,
        textColor,
        borderRadius,
        inputBackground
    )
    const labelStyle: CSSProperties = {
        color: accentColor,
        fontSize: 13,
        lineHeight: 1.3,
        display: "block",
        marginBottom: 6,
    }

    return (
        <form
            onSubmit={handleSubmit}
            noValidate
            style={{
                position: "relative",
                width: "100%",
                boxSizing: "border-box",
                background: surfaceColor,
                color: textColor,
                borderRadius: borderRadius,
                padding: 14,
                display: "flex",
                flexDirection: "column",
                gap: 10,
                fontFamily: "Inter, sans-serif",
            }}
            aria-label="Call proposal scheduler"
        >
            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 10,
                }}
            >
                <div>
                    <label htmlFor={dateId} style={labelStyle}>
                        {dateLabel}
                    </label>
                    <input
                        id={dateId}
                        name={dateId}
                        type="date"
                        required
                        min={minimumDate}
                        value={selectedDate}
                        onChange={handleDateChange}
                        aria-required="true"
                        aria-invalid={Boolean(errors.date)}
                        aria-describedby={`${helperId}${errors.date ? ` ${errorId}` : ""}`}
                        style={controlStyle}
                    />
                </div>
                <div>
                    <label htmlFor={timeId} style={labelStyle}>
                        {timeLabel}
                    </label>
                    <select
                        id={timeId}
                        name={timeId}
                        required
                        value={selectedTime}
                        onChange={handleTimeChange}
                        aria-required="true"
                        aria-invalid={Boolean(errors.time)}
                        aria-describedby={errors.time ? errorId : undefined}
                        style={controlStyle}
                    >
                        <option value="">Choose a 20-min slot</option>
                        {slots.map((slot) => {
                            const timeParts = parseTimeLabel(slot)
                            const endLabel = timeParts
                                ? minutesToTimeLabel(
                                      timeParts.hours * 60 +
                                          timeParts.minutes +
                                          CALL_DURATION_MINUTES
                                  )
                                : ""
                            return (
                                <option key={slot} value={slot}>
                                    {slot} – {endLabel}
                                </option>
                            )
                        })}
                    </select>
                </div>
            </div>
            <div>
                <label htmlFor={phoneId} style={labelStyle}>
                    {phoneLabel}
                </label>
                <input
                    id={phoneId}
                    name={phoneId}
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    required
                    placeholder="+353 86 000 0000"
                    value={phone}
                    onChange={handlePhoneChange}
                    aria-required="true"
                    aria-invalid={Boolean(errors.phone)}
                    aria-describedby={errors.phone ? errorId : undefined}
                    style={controlStyle}
                />
            </div>
            <div>
                <label htmlFor={meetingId} style={labelStyle}>
                    {meetingFieldLabel}
                </label>
                <select
                    id={meetingId}
                    name={meetingId}
                    value={meeting}
                    onChange={handleMeetingChange}
                    style={controlStyle}
                >
                    {MEETING_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                            {option.label}
                        </option>
                    ))}
                </select>
            </div>
            <div>
                <label htmlFor={detailsId} style={labelStyle}>
                    {detailsLabel}
                </label>
                <textarea
                    id={detailsId}
                    name={detailsId}
                    required
                    rows={4}
                    maxLength={DETAILS_MAX_LENGTH}
                    placeholder="A little about your business, or the problem you want help with."
                    value={details}
                    onChange={handleDetailsChange}
                    aria-required="true"
                    aria-invalid={Boolean(errors.details)}
                    aria-describedby={errors.details ? errorId : undefined}
                    style={fieldStyle(
                        accentColor,
                        textColor,
                        borderRadius,
                        inputBackground,
                        { minHeight: 88, resize: "vertical" }
                    )}
                />
            </div>
            <p
                id={helperId}
                style={{
                    margin: 0,
                    color: accentColor,
                    fontSize: 12,
                    lineHeight: 1.35,
                }}
            >
                {helperText}
            </p>
            {alertText ? (
                <p
                    id={errorId}
                    role="alert"
                    style={{
                        margin: 0,
                        color: errorColor,
                        fontSize: 12,
                        lineHeight: 1.35,
                    }}
                >
                    {alertText}
                </p>
            ) : null}
            <button
                type="submit"
                style={{
                    border: "none",
                    borderRadius: 999,
                    background: "#FFF7E8",
                    color: buttonText,
                    padding: "10px 14px",
                    fontSize: 14,
                    fontWeight: 600,
                    lineHeight: 1,
                    cursor: "pointer",
                    alignSelf: "flex-start",
                    whiteSpace: "nowrap",
                }}
            >
                {primaryLabel}
            </button>
            <a
                href={`mailto:${emailAddress}`}
                style={{
                    color: accentColor,
                    fontSize: 13,
                    lineHeight: 1.4,
                    textDecoration: "underline",
                    alignSelf: "flex-start",
                }}
            >
                {directEmailLabel}
            </a>
        </form>
    )
}

addPropertyControls(CallProposalScheduler, {
    emailAddress: {
        type: ControlType.String,
        title: "Email",
        defaultValue: "Jane@EverydayBusiness.ie",
    },
    helperText: {
        type: ControlType.String,
        title: "Helper",
        defaultValue:
            "Mon–Fri, 9:30–12:30, 20 minutes. At least 2 days ahead. This is a phone call (or coffee if you're local). Jane will confirm by email with a calendar booking.",
        displayTextArea: true,
    },
    primaryLabel: {
        type: ControlType.String,
        title: "Primary Label",
        defaultValue: "Email my proposed time",
    },
    directEmailLabel: {
        type: ControlType.String,
        title: "Direct Label",
        defaultValue: "Or email Jane directly",
    },
    dateLabel: {
        type: ControlType.String,
        title: "Date Label",
        defaultValue: "Proposed weekday",
    },
    timeLabel: {
        type: ControlType.String,
        title: "Time Label",
        defaultValue: "20-minute slot",
    },
    phoneLabel: {
        type: ControlType.String,
        title: "Phone Label",
        defaultValue: "Phone number",
    },
    detailsLabel: {
        type: ControlType.String,
        title: "Details Label",
        defaultValue: "Your business or what you need help with",
    },
    meetingLabel: {
        type: ControlType.String,
        title: "Meeting Label",
        defaultValue: "How should we meet?",
    },
    surfaceColor: {
        type: ControlType.Color,
        title: "Surface",
        defaultValue: "#102A43",
    },
    textColor: {
        type: ControlType.Color,
        title: "Text",
        defaultValue: "#F7F1E3",
    },
    accentColor: {
        type: ControlType.Color,
        title: "Accent",
        defaultValue: "#C6A36A",
    },
    borderRadius: {
        type: ControlType.Number,
        title: "Radius",
        defaultValue: 14,
        min: 8,
        max: 32,
        step: 1,
    },
})
