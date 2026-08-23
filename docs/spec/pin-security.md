# PINs: how sign-in works, and what it costs

**Date:** 2026-08-23
**Status:** Built. One decision left for the client, at the bottom.

---

## What the client asked for

1. No Google sign-in. Everyone signs in with a **six-digit PIN**.
2. The PIN is created **when the staff member is created**. Only Lim Davy, Kelly Tew,
   Chloe Chock and Imran can create staff.
3. A PIN is **unique** — no two people ever share one.
4. A person **never gets an old PIN back**.
5. Davy and Imran can **see the current PIN of every user**. Chloe and Kelly can see the
   PINs of the people within their reach.

Point 5 is the one that shapes everything below.

---

## Who may change whose PIN

| Who they are | Can change | Cannot change |
|---|---|---|
| **Store Promoter** | nobody, not even their own | everything |
| **Warehouse Team** | their own | anyone else's |
| **Finance Department** | their own | anyone else's |
| **Operational Manager** (Kelly) | her own, Finance, Warehouse, Promoters | Chloe's, Davy's, the Director's |
| **Davy's PA** (Chloe) | her own, Finance, Warehouse, Promoters | Kelly's, Davy's, the Director's |
| **Managing Director** (Davy) | anyone, his own included | — |
| **IT** (Imran) | anyone, Davy's included | — |
| **Director** (Vins) | nobody — the role cannot edit anything | everything |

**Nobody can change Davy's PIN except Davy and Imran.** Kelly and Chloe hold the same
authority as each other and deliberately cannot reach across to each other.

Seeing a PIN follows exactly the same table. If you can change it, you can read it; if you
cannot change it, you cannot read it.

Imran's own login is **hidden** — it does not appear on anyone else's Logins screen.

This is written once, in [`src/data/people.ts`](../../src/data/people.ts), as
`canChangePinOf()` and `canSeePinOf()`, and again in the database as
`can_change_pin_of()`. Every one of the rows above is covered by a test in
[`src/data/people.test.ts`](../../src/data/people.test.ts), so a future change that breaks
one of these rules fails the build rather than reaching the client.

---

## The uncomfortable part, said plainly

**A system that can show you somebody's PIN is not as safe as one that cannot.**

Normally a PIN or password is stored as a one-way hash: the system can check whether the
one you typed is right, but nobody — not the developer, not the database administrator,
not an attacker with a copy of the database — can turn the stored value back into the PIN.
That property is the whole point of hashing, and asking to *see* a colleague's PIN throws
it away.

We have built what you asked for. Here is what we did to make it as contained as it can be,
and what remains true anyway.

### How it is stored

Each PIN is held twice, and neither copy is readable on its own:

| Stored | What it is | What it is for |
|---|---|---|
| `pin_digest` | `hmac(pin, pepper)` | Sign-in, uniqueness, and the "never reuse" check. Reveals nothing. |
| `pin_cipher` | `pgp_sym_encrypt(pin, key)` | The recoverable copy, used only by `reveal_pin()`. |

Both the pepper and the key live in **Supabase Vault**, not in the database tables, not in
the application, and not in any file in this repository. A stolen copy of the database is
therefore not a list of everybody's PIN.

`reveal_pin()` checks the caller's authority before it decrypts anything, and writes a line
in the activity log every single time. So there is a permanent record of who looked at whose
PIN and when, readable on the **Activity** screen and filterable to just the PIN category.

The screens never read a PIN off a row — the Logins list and the set-PIN dialog both ask the
store for it, which is what makes the look-up recordable rather than invisible. In the
dialog the current PIN is hidden behind a "show it — this is recorded" button, so opening
the dialog to *set* a new PIN does not log a look-up that never happened.

The log never contains a PIN itself, old or new. That would undo the point of encrypting
them. It records that a PIN was changed, and by whom.

### What is still true

- Four people can read fifteen PINs. If one of those four accounts is compromised, so are
  the PINs they can reach. With hashing, that would not follow.
- Six digits is a million combinations. That is fine against a person at a keypad — we lock
  it for a minute after five wrong tries — and weak against a machine. Which is why the
  digest is peppered with a secret held outside the database.
- Anybody who can read the Vault can read every PIN. In practice that is Imran, which
  matches the authority he has been given anyway.

### What would make it materially safer, if you ever want it

Drop requirement 5. Keep everything else. Senior staff would then **set** a new PIN and
hand it over, instead of **looking up** the existing one — same day-to-day experience for
the person who forgot theirs, and the recoverable copy disappears entirely. That is a
one-line change to the schema and a small change to one screen.

We are not asking you to decide that now. It is written down so the choice stays visible.

---

## The rules a PIN must pass

Checked in the browser so the message is immediate, and again in the database so no path
can skip them:

- exactly six digits
- not one of the obvious ones — `000000`, `123456`, `111111`, and so on
- not currently in use by any other login, **including disabled ones**, so a leaver's PIN
  cannot be handed to the next joiner
- not one this person has held before, ever

The last one is why `pin_history` exists. It stores the digest of every retired PIN, never
the PIN itself.

---

## Sign-in

The landing page is the keypad — there is no separate front page. Six digits identify the
person on their own, so nobody picks a name first.

- Five wrong PINs locks that device for one minute. The count lives in the database
  (`pin_attempts`), not in the browser, so clearing the page does not clear the lock.
- A failed attempt says only that it failed. It never says whether that PIN belongs to
  someone but was mistyped, or belongs to nobody.
- The attempts table stores the device, never the PIN that was tried — a log of wrong
  guesses would be a list of candidate PINs.
- **Every sign-in, sign-out and wrong PIN is on the Activity screen.** `sign_in_with_pin()`
  returns nothing rather than raising an error when a PIN is wrong, precisely so that the
  "somebody tried a wrong PIN" row survives — an exception would roll the transaction back
  and take the evidence with it.
- A disabled login cannot sign in and cannot hold an open session.

---

## Before the client's staff use this for real

One thing must be removed: the demo panel on the sign-in screen listing everybody's PIN.
It exists so the client can walk through the system as each person without being handed a
list on paper. Set `SHOW_DEMO_PINS` to `false` in
[`src/pages/Login.tsx`](../../src/pages/Login.tsx) — that is the whole change, and nothing
else on the screen depends on it.

---

## The decision we need from Davy

**Do you want to be able to look up a colleague's current PIN, or is setting them a new one
enough?**

If looking it up matters, everything above stands and we are done. If setting a new one is
enough, we remove the recoverable copy and the system gets meaningfully safer at no cost to
how it feels to use. Either answer is workable — we would just rather you chose it than
inherited it.
