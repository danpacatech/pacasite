# PACA Website

The PACA site, built with Eleventy (a static site generator) and Decap CMS
(a free, browser-based content editor). Staff add shows in a simple form, the
site rebuilds itself, and the new show appears automatically.

## What is here

- `src/` is the source: pages, layouts, styles, logos, and the `shows` content.
- `src/admin/` is the content manager (the CMS).
- `src/shows/` holds one file per show. Staff never touch these by hand; the CMS writes them.
- `_site/` is the built website (created when you run the build; not committed).

There are three sample shows in `src/shows/`. Delete them once you add real ones.

## Preview it on your computer

1. Install Node 20 or newer.
2. In this folder, run `npm install` once.
3. Run `npm start`, then open `http://localhost:8080`.

To try the content editor locally with no login:
1. Keep `npm start` running.
2. In a second terminal, run `npm run cms`.
3. Open `http://localhost:8080/admin/`. Edits save to the files on your computer.

## Put it live on Netlify

1. Create a new GitHub repository and push this folder to it.
2. In Netlify: Add new site, Import from Git, choose the repo.
   Build command and publish folder are already set in `netlify.toml`
   (`npm run build`, publish `_site`). Deploy.
3. You get a `something.netlify.app` address. Rename it under
   Site configuration if you want something cleaner.

## Turn on the CMS login (so staff can edit the live site)

The old Netlify Identity login is deprecated, so this uses DecapBridge, which
is free and does not require your staff to have GitHub accounts.

1. Go to decapbridge.com, sign up, and create a site pointed at your GitHub repo.
2. It gives you three values: `repo`, `identity_url`, and `gateway_url`.
3. Open `src/admin/config.yml`, uncomment those three lines under `backend:`,
   and paste in the values. Commit and push.
4. In DecapBridge, invite your staff editors by email.
5. They go to `yoursite/admin/`, log in, and they are editing.

## How staff add a show

Go to `/admin/`, open Shows, click New Show, fill in the title, dates,
discipline, summary, and description, optionally upload a poster, then Publish.
Within about a minute the site rebuilds and the show shows up on the home page
and the What's On page on its own. Tick "Feature on the home page" to put a
show in the big hero block (feature one at a time).

There is also a Site Settings, Contact and Links entry in the CMS for editing
the address, phone, and the ticket and donate links across the whole site.

## Newsletter form

The signup form uses Netlify Forms, which is free on your account. Submissions
appear in the Netlify dashboard under Forms. No extra setup needed.

## Custom domain

When you are ready to go live on paca1505.org, point that domain's DNS at
Netlify (Netlify gives you the exact records). That is the cutover step from
the migration proposal.

## Not built yet (good next steps)

- About page
- Tenants directory page
- Merch store page (link or embed Square)
- Real production photos in place of the placeholder card backgrounds
- Eventbrite embedded checkout instead of out-links, if you prefer
