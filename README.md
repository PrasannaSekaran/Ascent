# Ascent — Cloud & DevOps Path for Two

A milestone-based learning path from Linux basics to production-grade cloud, built for two learners studying together.

- **12 modules in 5 stages:** Linux → Networking → Git → Scripting → Docker → CI/CD (Jenkins + GitHub Actions) → AWS → Azure → Kubernetes & Helm → Terraform & Ansible → Observability & SRE → GitOps & DevSecOps (+ a Google Cloud side quest)
- Each module has checkpoints with "Learn" links, curated free resources, a hands-on lab and a quick quiz
- **14 projects** (real GitHub repos), ending with a Grand Capstone
- **12 War Room drills:** realistic incidents with playbooks
- **Two-person tracking:** XP, levels, streaks, 19 badges, confetti, and notes for each learner (synced, side-by-side)

No build step. It's plain HTML/CSS/JS plus one Vercel serverless function for sync.

## Run locally

```bash
python -m http.server 5173   # then open http://localhost:5173
```

When you run it locally, progress is saved in your browser ("Local only").

## Deploy to Vercel

1. Push this folder to a GitHub repo, then go to **vercel.com → Add New → Project → Import** it. Use framework preset **Other**, with no build command and no output directory.
   *Or with the CLI:* `npm i -g vercel` and then `vercel` (later `vercel --prod`).
2. **Turn on sync between you two:** in the Vercel project, open **Storage → Create / Marketplace → Upstash (Redis)**. Create the free database and **connect it to this project**. This adds `KV_REST_API_URL` and `KV_REST_API_TOKEN` automatically.
3. **Redeploy** so the function picks up the env vars.
4. Each of you opens the site on your own device:
   - Friend 1 picks **Learner 1**, enters a name and copies the generated **squad code**.
   - Friend 2 picks **Learner 2** and pastes the **same squad code**.
   - The pill in the top bar should say **Synced**.

The squad code works like a shared password. Anyone who has it can read your squad's progress and notes, so keep it private.

If no storage is connected, everything still works locally. You can also use **Settings → Export / Import** to swap progress files.

## Customize

All course content lives in `data.js`: modules, topics, links, labs, quizzes, projects and drills. Add or edit entries there and the UI adapts. XP values and level names are at the top of `app.js`.

## Files

| File | Purpose |
|---|---|
| `index.html` | Shell, top bar, fonts, confetti library |
| `styles.css` | Light theme design system |
| `data.js` | All course content |
| `app.js` | Views, progress/XP/badges, notes, sync |
| `api/squad.js` | Vercel function: GET/PUT squad progress in Upstash Redis |
