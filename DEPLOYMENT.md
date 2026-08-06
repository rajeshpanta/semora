# Semora deployment map

Semora has two production applications. They share one repository and one
brand domain, but they are built and released independently.

| Surface | Source | Vercel project | Production domains | Deployment |
| --- | --- | --- | --- | --- |
| Student app | Repository root (`app/`, `components/`, `lib/`) | `semora-app` | `app.semoraai.com` | `npm run deploy:web:production` |
| Marketing website | `website/` | `semora-website` | `semoraai.com`, `www.semoraai.com` | Vercel Git deployment from `main` |

## Guardrails

- Do not create or use another hosting project for the student app.
- Do not deploy the repository root to `semora-website`.
- Do not deploy the `website/` directory to `semora-app`.
- The app production command builds the Expo web export, writes the non-secret
  `semora-app` project identity into `dist/.vercel/project.json`, and deploys
  that directory to production.
- The marketing project is connected to Git and deploys changes under
  `website/` from `main`.
- A purchased domain is the public address and DNS ownership. It does not
  contain or run either application; Vercel remains the host that builds and
  serves the software behind each domain.

## Expected production check

After a release:

1. `https://app.semoraai.com/settings` must serve the current Expo app bundle.
2. `https://app.semoraai.com/settings/language` must load directly.
3. `https://semoraai.com` and `https://www.semoraai.com` must remain on the
   marketing project.

The former private `chatgpt.site` deployment is historical only. Its project
configuration and worker build path have been removed from this repository, so
it must not be used as a release target.
