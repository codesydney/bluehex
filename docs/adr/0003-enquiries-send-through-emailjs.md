# Enquiries send through EmailJS, from the browser

The contact form at `/contact` posts the enquiry to EmailJS from the visitor's browser, using the same account, service and template the Code.Sydney site already sends through. There is no route handler, no mail provider credential, and no server-side send. Delivery lands in `info@code.sydney`, the inbox Code.Sydney enquiries land in today.

**The reason is that this project has no secrets and is worth keeping that way.** A route handler in front of Resend, Postmark or SES is the shape most people reach for, and every one of them needs an API key. That key would be the repository's first secret — a value in Vercel's production environment, absent from every clone, and a build that works on one machine and not another. Bluehex holds none today: the Supabase publishable key is `NEXT_PUBLIC_` by design, and `next build` passes with no environment set at all. EmailJS is the option that does not spend that.

**And the mail already goes somewhere a human reads.** Code.Sydney Pty Ltd trades as Bluehex, one person watches one inbox, and a second provider delivering to the same address would be two things to keep working for one stream of enquiries. Reusing the credentials was the director's instruction on issue #2, and it is also the smaller build.

## What this accepts

**The credentials are in the repository, and they are public either way.** `user_nEmQ6yi4aBPvlCKCkUAfK`, `service_9yexqpb` and `template_rl4e2gy` are in `src/app/contact/_lib/enquiry.ts` as plain constants. EmailJS sends from the browser, so all three are compiled into the JavaScript every visitor downloads — they are already readable in the page source of code.sydney and would be readable in Bluehex's whatever this repository did with them. Putting them behind `NEXT_PUBLIC_` environment variables was considered and rejected: it would buy no secrecy at all, and it would add three values that must exist in Vercel before a deploy, each of which fails as a form that silently stops working rather than as a build that stops building.

**What actually protects the account is the allowed-origins list in the EmailJS dashboard, which this repository cannot hold.** That list has to name Bluehex's origin or sends from it are refused, and if it is empty the key is open to anyone who copies it. It is a dashboard setting on someone's account and is therefore a step outside this repository — the same category as the Supabase access token hook, and worth the same suspicion when the form works locally and not in production.

**Spam handling is a honeypot, and a honeypot is not much.** The form carries a hidden field a person cannot see or tab to; anything that fills it is told the message sent and nothing is sent. That stops a bot that fills a form. It does nothing about a script that posts to EmailJS directly, which never loads the page — for that the controls are the dashboard's origin list and its rate limits. Turnstile was the alternative and was rejected for this round: it needs a secret to verify a token server-side, which is precisely the cost this decision exists to avoid, and it puts a challenge in front of every visitor to protect one inbox.

**The send is unauthenticated and unlogged on our side.** Nothing in this repository records that an enquiry was made, so there is no delivery receipt, no retry and no queue. If EmailJS is down the enquiry does not reach Bluehex — which is why the failure path hands the visitor a `mailto:` with everything they typed already in it rather than an apology. A message a visitor wrote must not disappear because a third party is having a bad day. That fallback is only reachable if the send can actually fail, which is why `sendEnquiry` carries its own fifteen-second timeout: `fetch` has none, and a connection that opens and then goes silent would otherwise leave the form disabled on "Sending…" indefinitely — the one loss this paragraph promises not to allow, arriving through the path with no error to catch.

## Considered options

**A route handler plus a mail provider.** The most conventional answer, and the one to revisit if any of the above stops holding. It buys a server-side send that cannot be replayed from a scraped key, somewhere to put Turnstile verification, and somewhere to log an enquiry. It costs the first secret, and #48's preview-environment question arrives with it. Deferred rather than rejected.

**A hosted form service — Formspree, Web3Forms.** A third party this company does not already use, for a job the one it does use already does. No advantage over EmailJS here except that its dashboard would belong to Bluehex rather than to Code.Sydney, which is a real difference and a small one while the two are the same company and the same inbox.

**A Bluehex-owned EmailJS account.** The likely next step rather than an alternative, and it changes three constants. Worth doing when Bluehex has its own address; not worth doing to get a different set of public ids into the same inbox. Note that `docs/scope.md` and the spec disagree about where enquiries should land — issue #82 — and this decision does not settle that; it delivers to where they land today.

## Consequences

**The inbox now receives mail from two sites through one template.** The template is Code.Sydney's and this repository cannot edit it, so the Bluehex send names itself in the first line of the message body — and names the practitioner an enquiry is about on the second, since the template has no variable for one. If the template ever gains those variables, that folding should come back out of `toTemplateParams`.

**`mailto:` stops being the happy path and becomes the safety net.** It was every submission before this; it is now the failure state and the answer for a visitor with JavaScript disabled, who is offered the address as a link above the form. The encoding rules it needs — percent-encoded spaces, no injectable second header — did not change and are now covered by tests rather than by a comment alone.

**The end-to-end suite must never send a real enquiry.** Every Playwright test that submits the form intercepts `api.emailjs.com`. A test that forgets to would put a message in a real person's inbox on every run, which is the kind of failure that is embarrassing rather than red.
