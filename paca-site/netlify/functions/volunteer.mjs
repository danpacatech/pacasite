import { getStore } from "@netlify/blobs";

const ADMIN_EMAILS = ["dan@paca1505.org", "megs@paca1505.org"];
const SITE_URL = process.env.URL || "https://paca1505.org";

const j = (o, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store" } });

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const clean = (s, n) => String(s == null ? "" : s).trim().slice(0, n);

async function sendEmail(to, subject, html) {
  const key = process.env.RESEND_API_KEY;
  if (!key) return;
  const recipients = Array.isArray(to) ? to : [to];
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "PACA Volunteers <volunteers@paca1505.org>",
      to: recipients,
      subject,
      html
    })
  });
}

function emailHtml(title, body) {
  return `<!doctype html><html><body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#20151f">
<div style="background:#2B0B3E;padding:20px 24px;border-radius:10px 10px 0 0">
  <h1 style="color:#F4EDE0;margin:0;font-size:22px">${title}</h1>
</div>
<div style="border:1px solid #e6ddd0;border-top:none;border-radius:0 0 10px 10px;padding:24px">
  ${body}
  <hr style="border:none;border-top:1px solid #e6ddd0;margin:24px 0">
  <p style="color:#8a7f93;font-size:13px;margin:0">PACA · 1505 State Street · Erie, PA 16501 · paca1505.org</p>
</div>
</body></html>`;
}

export default async (req) => {
  const expected = process.env.VOLUNTEER_PASSWORD || "";
  const url = new URL(req.url);
  const action = url.searchParams.get("action") || "";
  const qp = (k) => url.searchParams.get(k) || "";

  // Cancel uses a token, no password needed
  if (action === "cancel") {
    const token = clean(qp("token"), 60);
    if (!token) return j({ error: "invalid token" }, 400);
    const store = getStore("paca-volunteer");
    const signups = await store.get("signups", { type: "json" }) || [];
    const idx = signups.findIndex(s => s.cancelToken === token);
    if (idx === -1) return j({ error: "not found" }, 404);
    const [removed] = signups.splice(idx, 1);
    await store.setJSON("signups", signups);
    // notify admin
    await sendEmail(ADMIN_EMAILS,
      `Volunteer cancelled: ${removed.name}`,
      emailHtml("Volunteer Cancellation",
        `<p><strong>${removed.name}</strong> has cancelled their signup for:</p>
         <p style="background:#f4ede0;padding:12px;border-radius:8px"><strong>${removed.eventName}</strong><br>${removed.slotRole}</p>
         <p style="color:#8a7f93">Email: ${removed.email}</p>`
      )
    );
    return j({ ok: true, removed });
  }

  // All other actions require the volunteer or admin password
  const volPassword = process.env.VOLUNTEER_PASSWORD || "";
  const adminPassword = process.env.VOLUNTEER_ADMIN_PASSWORD || "";
  const givenKey = req.headers.get("x-vol-key") || "";
  const isAdmin = adminPassword && givenKey === adminPassword;
  const isVol = volPassword && givenKey === volPassword;

  if (!isAdmin && !isVol) {
    return j({ error: "unauthorized" }, 401);
  }

  // Admin-only actions
  if ((action === "signups" || action === "remove") && !isAdmin) {
    return j({ error: "unauthorized" }, 401);
  }

  let body = {};
  if (req.method === "POST") { try { body = await req.json(); } catch (e) {} }
  const store = getStore("paca-volunteer");
  const get = async (k, d) => { const v = await store.get(k, { type: "json" }); return v == null ? d : v; };

  if (action === "events") {
    // Events are managed in the CMS and served via /_data/volunteer-events.json
    // The function reads them from a static JSON file built into the site
    const eventsRes = await fetch(`${SITE_URL}/volunteer-events.json`);
    const cmsEvents = eventsRes.ok ? await eventsRes.json() : [];
    const signups = await get("signups", []);
    const activeEvents = cmsEvents.filter(ev => ev.active !== false)
      .sort((a, b) => (a.date || "").localeCompare(b.date || ""));
    return j({ events: activeEvents.map(ev => ({
      ...ev,
      slots: (ev.slots || []).map(slot => ({
        ...slot,
        signedUp: signups.filter(s => s.eventId === ev.id && s.slotId === slot.id).length,
        volunteers: signups.filter(s => s.eventId === ev.id && s.slotId === slot.id).map(s => s.name)
      }))
    }))});
  }

  if (action === "signup") {
    const eventId = clean(body.eventId, 40);
    const slotId  = clean(body.slotId, 40);
    const name    = clean(body.name, 80);
    const email   = clean(body.email, 120);
    if (!eventId || !slotId || !name || !email) return j({ error: "missing fields" }, 400);

    const eventsRes = await fetch(`${SITE_URL}/volunteer-events.json`);
    const events  = eventsRes.ok ? await eventsRes.json() : [];
    const event   = events.find(e => e.id === eventId);
    if (!event) return j({ error: "event not found" }, 404);
    const slot    = (event.slots || []).find(s => s.id === slotId);
    if (!slot) return j({ error: "slot not found" }, 404);

    const signups = await get("signups", []);

    // One slot per named event rule
    const alreadyInEvent = signups.find(s => s.eventId === eventId && s.email.toLowerCase() === email.toLowerCase());
    if (alreadyInEvent) return j({ error: "already_signed_up", message: `You're already signed up for ${alreadyInEvent.slotRole} at this event.` }, 409);

    // Capacity check
    const filled = signups.filter(s => s.eventId === eventId && s.slotId === slotId).length;
    if (filled >= slot.capacity) return j({ error: "full", message: "Sorry, that slot is full." }, 409);

    const cancelToken = uid();
    const signup = {
      id: uid(), eventId, slotId, name, email,
      eventName: event.name, eventDate: event.date, eventTime: event.time,
      slotRole: slot.role, cancelToken,
      ts: new Date().toISOString()
    };
    signups.push(signup);
    await store.setJSON("signups", signups);

    // Confirmation email to volunteer
    const cancelUrl = `${SITE_URL}/vol-schedule/?action=cancel&token=${cancelToken}`;
    await sendEmail(email,
      `You're signed up: ${event.name}`,
      emailHtml(`You're signed up!`,
        `<p>Hi ${name}, you're confirmed for:</p>
         <div style="background:#f4ede0;padding:16px;border-radius:8px;margin:16px 0">
           <strong style="font-size:18px">${event.name}</strong><br>
           <span style="color:#ED2375;font-weight:600">${slot.role}</span><br>
           <span style="color:#6a5a78">${event.date}${event.time ? " at " + event.time : ""}</span>
         </div>
         <p>You'll get a reminder 48 hours before the event.</p>
         <p><a href="${cancelUrl}" style="color:#ED2375">Need to cancel? Click here.</a></p>`
      )
    );

    // Notify admins
    await sendEmail(ADMIN_EMAILS,
      `New volunteer signup: ${name} for ${event.name}`,
      emailHtml("New Volunteer Signup",
        `<p><strong>${name}</strong> signed up for:</p>
         <div style="background:#f4ede0;padding:16px;border-radius:8px;margin:16px 0">
           <strong>${event.name}</strong> · ${slot.role}<br>
           <span style="color:#6a5a78">${event.date}${event.time ? " at " + event.time : ""}</span>
         </div>
         <p>Email: ${email}</p>
         <p>Slot: ${filled + 1} of ${slot.capacity} filled</p>`
      )
    );

    return j({ ok: true, signup });
  }

  if (action === "signups") {
    // Admin: get all signups
    const signups = await get("signups", []);
    return j({ signups });
  }

  if (action === "remove") {
    // Admin: force-remove a signup by id
    const id = clean(body.id, 40);
    const signups = await get("signups", []);
    const idx = signups.findIndex(s => s.id === id);
    if (idx === -1) return j({ error: "not found" }, 404);
    const [removed] = signups.splice(idx, 1);
    await store.setJSON("signups", signups);
    return j({ ok: true, removed });
  }

  if (action === "send_reminders") {
    // Called by Make on a schedule — sends 48hr volunteer reminders and 12hr admin alerts
    const signups = await get("signups", []);
    const eventsRes2 = await fetch(`${SITE_URL}/volunteer-events.json`);
    const events  = eventsRes2.ok ? await eventsRes2.json() : [];
    const now = Date.now();
    let sent48 = 0, sent12 = 0;

    for (const ev of events) {
      if (!ev.date) continue;
      const evTime = new Date(`${ev.date}${ev.time ? "T" + to24(ev.time) : "T19:00:00"}`).getTime();
      const hrs = (evTime - now) / 36e5;

      // 48hr volunteer reminders (between 47 and 49 hrs out)
      if (hrs >= 47 && hrs <= 49) {
        const evSignups = signups.filter(s => s.eventId === ev.id);
        for (const s of evSignups) {
          const cancelUrl = `${SITE_URL}/volunteer/?action=cancel&token=${s.cancelToken}`;
          await sendEmail(s.email,
            `Reminder: ${ev.name} is in 2 days`,
            emailHtml("Volunteer Reminder",
              `<p>Hi ${s.name}, just a reminder that you're signed up to volunteer for:</p>
               <div style="background:#f4ede0;padding:16px;border-radius:8px;margin:16px 0">
                 <strong style="font-size:18px">${ev.name}</strong><br>
                 <span style="color:#ED2375;font-weight:600">${s.slotRole}</span><br>
                 <span style="color:#6a5a78">${ev.date}${ev.time ? " at " + ev.time : ""}</span>
               </div>
               <p>Thank you for volunteering at PACA!</p>
               <p><a href="${cancelUrl}" style="color:#ED2375">Need to cancel? Click here.</a></p>`
            )
          );
          sent48++;
        }
      }

      // 12hr admin alert (between 11 and 13 hrs out)
      if (hrs >= 11 && hrs <= 13) {
        const evSignups = signups.filter(s => s.eventId === ev.id);
        const slots = ev.slots || [];
        const slotSummary = slots.map(slot => {
          const filled = evSignups.filter(s => s.slotId === slot.id);
          return `<tr><td style="padding:6px 12px;border-bottom:1px solid #e6ddd0">${slot.role}</td>
                  <td style="padding:6px 12px;border-bottom:1px solid #e6ddd0">${filled.length}/${slot.capacity}</td>
                  <td style="padding:6px 12px;border-bottom:1px solid #e6ddd0">${filled.map(s=>s.name).join(", ") || "—"}</td></tr>`;
        }).join("");
        await sendEmail(ADMIN_EMAILS,
          `Volunteer roster for tonight: ${ev.name}`,
          emailHtml(`Tonight's Volunteers: ${ev.name}`,
            `<p>${ev.date}${ev.time ? " at " + ev.time : ""}</p>
             <table style="width:100%;border-collapse:collapse;margin:16px 0">
               <tr style="background:#f4ede0"><th style="padding:8px 12px;text-align:left">Role</th><th style="padding:8px 12px;text-align:left">Filled</th><th style="padding:8px 12px;text-align:left">Volunteers</th></tr>
               ${slotSummary}
             </table>
             <p style="color:#6a5a78">Total: ${evSignups.length} volunteer${evSignups.length !== 1 ? "s" : ""}</p>`
          )
        );
        sent12++;
      }
    }
    return j({ ok: true, sent48, sent12 });
  }

  return j({ error: "unknown action" }, 400);
};

function to24(t) {
  const m = t.match(/(\d+):(\d+)\s*(am|pm)/i);
  if (!m) return "19:00:00";
  let h = parseInt(m[1]);
  const min = m[2];
  const ap = m[3].toLowerCase();
  if (ap === "pm" && h !== 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  return `${String(h).padStart(2,"0")}:${min}:00`;
}
