# Test backups

Synthetic data only, never a real backup.

`gpg-made.tar.gz.gpg.b64` is, in base64 (`base64 -d` gives the file back), a backup made the way the nightly job makes them
(`ops/backup/.github/workflows/nightly-backup.yml`):

```bash
tar -czf fixture.tar.gz schema.sql data.sql counts-before.txt counts-after.txt
printf '%s' 'test-passphrase-only' | gpg --batch --yes --quiet --pinentry-mode loopback \
  --passphrase-fd 0 --symmetric --cipher-algo AES256 \
  --s2k-digest-algo SHA512 --s2k-count 65011712 \
  --output gpg-made.tar.gz.gpg fixture.tar.gz
```

The two `--s2k-…` flags pin what the job's GnuPG 2.4 on ubuntu-latest
chooses by itself. `gpg --list-packets` on a real backup (18 November) shows
`symkey enc packet: version 4, cipher 9, aead 0, s2k 3, hash 10`, `count
65011712`, then an encrypted data packet with `mdc_method: 2`, and this
fixture shows the same.

Its `data.sql` holds three documents (a sale line, a closing with one line
and one count, a log line), one login whose password hash is made up, one
outlet and one setting. The passphrase is `test-passphrase-only`.
