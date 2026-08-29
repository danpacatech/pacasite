export default async (req) => {
  const url = new URL(req.url);
  const name  = url.searchParams.get("name") || "PACA Event";
  const role  = url.searchParams.get("role") || "Volunteer";
  const start = url.searchParams.get("start") || "";
  const end   = url.searchParams.get("end") || "";
  const ics = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//PACA//Volunteer//EN",
    "BEGIN:VEVENT",
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:PACA Volunteer: ${name} (${role})`,
    "LOCATION:PACA\\, 1505 State Street\\, Erie\\, PA 16501",
    "END:VEVENT", "END:VCALENDAR"
  ].join("\r\n");
  return new Response(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar;charset=utf-8",
      "Content-Disposition": `attachment; filename="paca-volunteer.ics"`
    }
  });
};
