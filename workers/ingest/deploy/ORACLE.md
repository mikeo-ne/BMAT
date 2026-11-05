# Run the worker free on Oracle Cloud

Oracle's **Always Free** tier includes an ARM server with up to 4 CPU cores and
24 GB of memory, free for as long as the account is active. That's far more than
the worker needs (≈ 0.5 GB for 26 stations), including brand mentions.

## 1. Create the account (≈ 15 min)

1. Go to <https://www.oracle.com/cloud/free/> → **Start for free**.
2. **Home region:** pick **UK South (London)** or **Germany Central (Frankfurt)**,
   close to the Supabase database in Ireland. This can't be changed later.
3. Oracle asks for a card to verify you. Always Free resources are not charged.
   Don't click "Upgrade to paid" later unless you mean to.

## 2. Create the server (≈ 10 min)

1. Menu → **Compute → Instances → Create instance**.
2. **Name:** `eastsound-worker`.
3. **Image:** click *Change image* → **Canonical Ubuntu 24.04** (or 22.04).
4. **Shape:** click *Change shape* → **Ampere** → **VM.Standard.A1.Flex**:
   **2 OCPUs, 12 GB memory**. It should say *Always Free-eligible*.
5. **SSH keys:** choose **Generate a key pair for me** → click **Save private key**,
   and keep that file safe. You need it to log in.
6. Click **Create**. When it shows *Running*, copy the **Public IP address**.

> **"Out of capacity"?** Free ARM servers are popular. Try another
> *Availability domain* (AD-2, AD-3) on the same page, try **1 OCPU / 6 GB**,
> or try again later in the day.

## 3. Log in and run the setup (≈ 10 min)

Mac / Linux, in Terminal (replace the file name and IP):

```bash
chmod 400 ~/Downloads/ssh-key-*.key
ssh -i ~/Downloads/ssh-key-*.key ubuntu@YOUR.PUBLIC.IP
```

Windows: Windows Terminal or PowerShell, same command with your key's path.
Alternatively, use the instance page's **Cloud Shell** / **Console connection**.

Then, on the server, paste:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/mikeo-ne/BMAT/main/workers/ingest/deploy/oracle-setup.sh)
```

When it asks, paste the Supabase **secret** key (`sb_secret_…`). Nothing shows as
you paste. It is checked with Supabase and saved on the server only.

The script installs Docker, builds the worker, starts it (restarting on crash or
reboot), and checks GitHub every 30 minutes for new code.

## 4. Switch off Railway

Run only **one** worker at a time, or every play is logged twice. Once the
Oracle worker shows `monitoring 26 stations` in its logs:

Railway → **east sound** → **BMAT** → **Settings** → bottom → **Delete service**.

Songs already learned on Railway are re-learned automatically by the new
server from the uploaded reference copies.

## Everyday commands (on the server)

| What | Command |
|---|---|
| Watch the logs | `sudo docker logs -f eastsound-worker` (Ctrl+C to stop) |
| Health check | `sudo docker exec eastsound-worker python -m eastsound_ingest --stations stations.csv doctor` |
| Update now | `sudo eastsound-update` |
| Restart | `sudo docker restart eastsound-worker` |
| Change the key | `sudo rm /etc/eastsound/worker.env` then run the setup line again |

Turn on brand mentions later: add `EST_MENTIONS=1` to `/etc/eastsound/worker.env`
(`sudo nano /etc/eastsound/worker.env`), then run the setup line again.
