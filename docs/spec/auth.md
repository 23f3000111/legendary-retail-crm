# Signing in

**Date:** 2026-09-11
**Status:** Built.

---

## What the client asked for

> *"Remove 2-step verification for staff — only the main people at HQ have 2-step
> login. Manage Logins now manages staff username and password. All things will
> be like previous, but instead of PIN it's username and password."*

So:

- **Everyone signs in with a username and a password.**
- **Leadership and IT also get a six-digit code by e-mail.** Everyone else is in
  as soon as the password is right.
- **Everything else works exactly as the PINs did** — who issues them, who can
  change whose, and who can look them up.

---

## Who gets the code

| | Code by e-mail? |
|---|---|
| Vins Lim — Director | Yes |
| Lim Davy — Managing Director | Yes |
| Kelly Tew — Operational Manager | Yes |
| Chloe Chock — PA | Yes |
| Imran — IT | Yes |
| Finance, Warehouse, Store Promoters | No |

"The main people at HQ" was read as the top of the chart, plus IT. That is also
the right line on security grounds: **the four who can read other people's
passwords are exactly the four whose accounts would give the whole company away
if one were guessed**, and the Director can read every figure in the business.
For a promoter at a counter, the code was more friction than it was worth.

It is one list — `TWO_STEP_ROLES` in [`people.ts`](../../src/data/people.ts), and
`two_step_roles()` in the schema — if the client wants it wider or narrower.

---

## Who may set and see whose password

Exactly the PIN rules:

| Who they are | Can set and see | Cannot |
|---|---|---|
| **Store Promoter** | nobody — they use the one they were given | everything, their own included |
| **Warehouse Team** | their own | anyone else's |
| **Finance Department** | their own | anyone else's |
| **Operational Manager** (Kelly) | her own, Finance, Warehouse, Promoters | Chloe's, Davy's, the Director's |
| **Davy's PA** (Chloe) | her own, Finance, Warehouse, Promoters | Kelly's, Davy's, the Director's |
| **Managing Director** (Davy) | anyone, his own included | — |
| **IT** (Imran) | anyone, Davy's included | — |
| **Director** (Vins) | nobody — the role cannot edit anything | everything |

**Nobody can set or see Davy's password except Davy and Imran.** Imran's own login
stays hidden from everybody else's Logins screen.

Every row of this table has a test in
[`people.test.ts`](../../src/data/people.test.ts).

---

## The trade-off, said plainly

Being able to *look up* a password means the system has to keep one it can read
back. This is the same compromise the PIN design carried, and it is worth being
clear that **it is worse for passwords than it was for PINs**:

- Nobody reuses a six-digit PIN on their bank. People **do** reuse passwords. If
  somebody sets their CRM password to the one on their personal e-mail, four
  people in the company can now read their personal e-mail password.
- A stolen copy of the database is not a list of passwords — the readable copy is
  encrypted with a key held in Supabase Vault, outside the tables. But anybody
  who can reach the Vault can read every one.

### What is in place to contain it

1. **Promoters never choose a password at all.** A senior issues it and they keep
   it, so the largest group of staff cannot reuse a personal one.
2. **Anybody who *can* choose their own is warned**, in the dialog where they do
   it, not to reuse one from anywhere else — and told why.
3. **Every look-up is recorded** on the Activity screen: who looked, whose, and
   when. The password itself is never written to the log.
4. **The accounts that can look passwords up are the ones with the second step.**
   Guessing one of those passwords is not enough.
5. **Passwords are never unique across people.** The PIN rule that no two people
   share one does not carry over — for a password, enforcing it would tell
   whoever tried a clashing one that it belongs to somebody else.

### What would remove it entirely

Drop the look-up. Seniors would *set* a new password and hand it over, rather
than *read* the current one — the same day-to-day experience for the person who
forgot theirs, and the readable copy disappears. The last round was built that
way; it is a small change back if the client ever wants it.

---

## How it is stored

| Stored | What it is |
|---|---|
| `password_hash` | Argon2id. Checked at sign-in. Not reversible. |
| `password_cipher` | Encrypted with a Vault key. Read only through `reveal_password()`. |
| `password_history` | Every password they have held, hashed, so none is ever reissued. |
| `login_codes` | The second step, for leadership and IT only. Hashed, single use, ten minutes. |
| `login_attempts` | Who tried and whether it worked. **Never what they typed.** |

The hash and the encrypted copy are made in the Edge Function, not in SQL — a
password should not pass through the query log on its way in.

---

## The rules a password must pass

Checked in the browser for an immediate message, and again in the database:

- at least **10 characters**, with letters and a number
- not an obvious one — anything containing `password`, `legendary`, `qwerty`,
  `perfume` and the rest of the usual list
- not the one already in use, and **never one this person has had before**

---

## Signing in

1. **Username and password.** A wrong username and a wrong password produce the
   same sentence, so nobody learns which half they had right.
2. **Five wrong attempts holds the account for a minute**, counted against the
   account in the database, not the device.
3. **Leadership and IT then get a code** at their work address, shown masked on
   screen. Ten minutes, single use; five wrong codes and they start again.
4. Everybody else is in.
5. A disabled login cannot sign in and cannot hold an open session.

---

## Before real staff use this

1. **Turn off the walkthrough panel** — `SHOW_DEMO_HELP` in
   [`src/pages/Login.tsx`](../../src/pages/Login.tsx). It lists the demo logins
   and shows the code that would have been e-mailed.
2. **Wire the mail.** No mail is sent in this build. In production
   `beginSignIn` becomes one request to an Edge Function that checks the
   password, sends the code where one is needed, and returns only "sent".
3. **Confirm the e-mail addresses.** Every account is currently
   `‹username›@legendary.com.my`. The code goes to whatever is on the account.
