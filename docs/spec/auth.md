# Signing in

**Date:** 2026-09-09
**Status:** Built. Replaces the PIN design entirely.

---

## What the client asked for

> *"Client wants a secure way to login — a login with username and password and
> then a two-step verification like a login link on mail or a code on mail.
> Remove PIN login."*

So: **username → password → six-digit code sent to their work e-mail.** The
keypad is gone.

---

## This is a straight improvement, and worth saying why

The PIN design carried one uncomfortable compromise, written up at the time and
flagged again at every hand-over: the client wanted senior staff to be able to
*look up* a colleague's current PIN, and a system that can show you a credential
cannot store it as a one-way hash. So a recoverable copy had to exist, encrypted
with a key that four people could reach.

**That whole problem disappears.** A password is stored as an Argon2id hash and
nothing else. Nobody can read one back — not Davy, not Imran, not somebody
holding a stolen copy of the database. There is no recoverable copy, no
encryption key to protect, and no "who may see whose credential" question,
because the answer is now *nobody*.

The second step is what the client actually asked for and it is the right
instinct. A password alone can be shoulder-surfed at a counter, guessed, or
reused from a site that has already been breached. A code that lands in the
person's own mailbox means knowing the password is not enough.

---

## Who may reset whose password

The authority table is unchanged from the PIN rules. Only the verb is different,
because a hash can be replaced but never revealed.

| Who they are | Can reset | Cannot reset |
|---|---|---|
| **Store Promoter** | their own | anyone else's |
| **Warehouse Team** | their own | anyone else's |
| **Finance Department** | their own | anyone else's |
| **Operational Manager** (Kelly) | her own, Finance, Warehouse, Promoters | Chloe's, Davy's, the Director's |
| **Davy's PA** (Chloe) | her own, Finance, Warehouse, Promoters | Kelly's, Davy's, the Director's |
| **Managing Director** (Davy) | anyone, his own included | — |
| **IT** (Imran) | anyone, Davy's included | — |
| **Director** (Vins) | his own | everyone else's — the role cannot edit anything |

**Nobody can reset Davy's password except Davy and Imran.** Kelly and Chloe hold
the same authority as each other and deliberately cannot reach across.

One thing did change: **everybody can now set their own.** A promoter could not
change their own PIN because a senior had to be able to look it up. With a hash
nobody can look anything up, so the reason for that restriction is gone.

Imran's own login stays **hidden** — it does not appear on anyone else's Logins
screen.

This lives once in [`src/data/people.ts`](../../src/data/people.ts) as
`canResetPasswordOf()`, again in the database as `can_reset_password_of()`, and
every row of the table above is covered by a test in
[`people.test.ts`](../../src/data/people.test.ts).

---

## How it is stored

| Stored | What it is |
|---|---|
| `password_hash` | Argon2id. One way. Not reversible by anyone. |
| `password_history` | Hashes of everything they have used before, so a password is never reissued. |
| `login_codes` | The second step — hashed too, single use, ten minutes. |
| `login_attempts` | Who tried, from what device, and whether it worked. **Never what they typed.** |

Hashing happens in the Edge Function, not in SQL. A password should not travel
as far as a SQL statement, where it would pass through the query log and the
statement cache on the way in.

---

## The rules a password must pass

Checked in the browser so the message is immediate, and again in the database so
no path can skip them:

- at least **10 characters**
- letters and at least one number
- not an obvious one — anything containing `password`, `legendary`, `qwerty`,
  `perfume` and the rest of the usual list
- not the one already in use
- **never one this person has used before**

Length is weighted above everything else because length is what actually
matters. The meter beside the box says so rather than demanding a symbol.

---

## Signing in, step by step

1. **Username and password.** A wrong username and a wrong password produce the
   *same* sentence — "That username and password do not match." Saying which
   half was wrong hands over the other half.
2. **Five wrong attempts holds the account for a minute.** Counted in the
   database against the account, not in the browser against the device.
3. **A six-digit code goes to their work address.** The screen shows it masked —
   `ke••••••@legendary.com.my` — so an onlooker learns nothing.
4. **The code lasts ten minutes and is good once.** Five wrong codes throws the
   whole attempt away and returns to step one.
5. A **disabled login** cannot sign in and cannot hold an open session.

Every one of those events is on the Activity screen: codes sent, sign-ins,
sign-outs, refusals and lock-outs. What is never recorded is the password or the
code itself — a log of guesses would be a list of candidate passwords.

---

## Starting passwords

Everybody is issued one when their login is created and asked to choose their
own the first time they sign in (`must_change_password`). The Logins screen
counts how many people are still on the one they were given.

---

## Before the client's staff use this for real

Two things:

1. **Turn off the walkthrough panel.** `SHOW_DEMO_HELP` in
   [`src/pages/Login.tsx`](../../src/pages/Login.tsx). It lists the demo logins
   and shows the code that would have been e-mailed. In production the code
   never reaches the browser at all, so there would be nothing to show — but the
   login list would still be there.
2. **Wire the mail.** Right now no mail is sent; the code is generated in the
   browser. In production `beginSignIn` becomes one request to an Edge Function
   that hashes the password, issues the code, sends it, and returns nothing but
   *"we sent it"*. That is the whole difference, and it is contained in
   [`src/store/useAuth.ts`](../../src/store/useAuth.ts).

---

## Two things to confirm with the client

**The e-mail addresses.** Revision 2 gave usernames but no addresses. Every
account is currently `‹username›@legendary.com.my`, which is a guess — and the
code goes to whatever is on the account, so these have to be right before
anybody relies on them.

**Whether a code every time is too much.** As built, every sign-in asks for one.
The usual compromise is to remember a device for thirty days, so a promoter on
the shop iPad enters a code once a month rather than every morning, while any
new device still needs one. That is a small change and a real difference to how
the counter feels. Worth a sentence from Davy.
