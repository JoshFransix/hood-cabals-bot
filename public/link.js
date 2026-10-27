(() => {
  const $ = (id) => document.getElementById(id);
  const nonce = new URLSearchParams(location.search).get("n") || "";
  const state = { step: 1, address: null, message: null, botUsername: null, provider: null };

  // EIP-6963: every installed wallet announces itself, so the user picks one
  // instead of whichever extension grabbed window.ethereum
  const wallets = [];
  window.addEventListener("eip6963:announceProvider", (event) => {
    const { info, provider } = event.detail || {};
    if (!info || !provider || wallets.some((w) => w.info.uuid === info.uuid)) return;
    wallets.push({ info, provider });
  });
  window.dispatchEvent(new Event("eip6963:requestProvider"));

  function setStep(step) {
    state.step = step;
    document.querySelectorAll(".phase").forEach((el) => {
      const n = Number(el.dataset.step);
      el.classList.toggle("phase-done", n < step);
      el.classList.toggle("phase-active", n === step);
      el.querySelector(".phase-marker").textContent = n < step ? "✓" : `0${n}`;
      el.querySelector(".phase-tag").textContent = n < step ? "DONE" : n === step ? "NOW" : "NEXT";
    });
    const done = Math.min(step - 1, 3);
    $("progress").style.setProperty("--progress", `${(done / 3) * 100}%`);
    $("progress-text").textContent = `${done} / 3`;
  }

  function setBadge(text, kind) {
    $("badge-text").textContent = text;
    $("badge").className = `closed-badge ${kind ? `is-${kind}` : ""}`;
  }

  function setAction(text, onClick, disabled = false) {
    $("action-text").textContent = text;
    $("action").disabled = disabled;
    $("action").onclick = onClick;
  }

  function fail(message) {
    $("error").textContent = message;
  }

  function sealed(title, copy) {
    setBadge("SEALED");
    $("status-title").textContent = title;
    fail(copy);
    setAction("BACK TO TELEGRAM", () => openTelegram());
  }

  function openTelegram() {
    location.href = state.botUsername ? `https://t.me/${state.botUsername}` : "https://t.me";
  }

  function toHex(text) {
    return "0x" + Array.from(new TextEncoder().encode(text), (b) => b.toString(16).padStart(2, "0")).join("");
  }

  // Some wallets (Phantom) send an https icon or none at all; fall back to a lettered tile
  function walletIcon(info) {
    const tile = document.createElement("span");
    tile.className = "wallet-tile";
    tile.textContent = (info.name || "?").trim().charAt(0).toUpperCase();
    if (!/^(data:image\/|https:\/\/)/.test(info.icon || "")) return tile;
    const img = document.createElement("img");
    img.src = info.icon;
    img.alt = "";
    img.onerror = () => img.replaceWith(tile);
    return img;
  }

  function renderWalletList() {
    const list = $("wallet-list");
    list.replaceChildren();
    for (const wallet of wallets) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "wallet-option";
      button.append(walletIcon(wallet.info));
      const name = document.createElement("span");
      name.textContent = wallet.info.name;
      button.append(name);
      button.onclick = () => {
        state.provider = wallet.provider;
        list.hidden = true;
        connect();
      };
      list.append(button);
    }
    list.hidden = false;
    setAction("CHOOSE A WALLET", null, true);
  }

  async function connect() {
    fail("");
    setAction("CONNECTING…", null, true);
    // A wallet popup can open behind the browser window and look like a hang
    const hint = setTimeout(() => fail("Nothing popped up? Click your wallet's extension icon in the toolbar."), 8000);
    try {
      const [address] = await state.provider.request({ method: "eth_requestAccounts" });
      clearTimeout(hint);
      state.address = address;
      $("connect-copy").innerHTML = `Connected <code>${address.slice(0, 6)}…${address.slice(-4)}</code>`;
      setStep(2);
      setAction("SIGN MESSAGE", sign);
    } catch (err) {
      clearTimeout(hint);
      fail(err?.code === 4001 ? "Connection rejected in your wallet." : "Couldn't connect. Try again.");
      if (wallets.length > 1) renderWalletList();
      else setAction("CONNECT WALLET", connect);
    }
  }

  async function sign() {
    fail("");
    setAction("WAITING FOR SIGNATURE…", null, true);
    let signature;
    try {
      signature = await state.provider.request({
        method: "personal_sign",
        params: [toHex(state.message), state.address],
      });
    } catch (err) {
      fail(err?.code === 4001 ? "Signature rejected. Nothing was linked." : "Signing failed. Try again.");
      setAction("SIGN MESSAGE", sign);
      return;
    }

    setAction("VERIFYING…", null, true);
    const res = await fetch("/api/link", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nonce, address: state.address, signature }),
    }).catch(() => null);
    const body = res ? await res.json().catch(() => ({})) : {};
    if (!res || !res.ok) {
      fail(body.error || "Verification failed. Try again.");
      setAction("SIGN MESSAGE", sign);
      return;
    }

    setStep(4);
    setBadge("LINKED", "done");
    $("status-title").textContent = body.tier ? `Welcome to ${body.tier}.` : "Wallet linked.";
    $("enter-copy").textContent = body.tier
      ? `${body.nftCount} held. Your rooms are waiting in the bot.`
      : "No Hood Cabals in this wallet yet. Pick one up and tap Refresh in the bot.";
    setAction("BACK TO TELEGRAM", openTelegram);
  }

  async function init() {
    setStep(1);
    const res = await fetch(`/api/link/${encodeURIComponent(nonce)}`).catch(() => null);
    const body = res ? await res.json().catch(() => ({})) : {};
    state.botUsername = body.botUsername || null;
    if (!res || !res.ok) {
      sealed("This link has burned.", body.error || "Request a fresh one from the bot with /link.");
      return;
    }
    state.message = body.message;

    // Give wallets a moment to announce themselves
    await new Promise((r) => setTimeout(r, 300));

    if (wallets.length > 1) {
      renderWalletList();
      return;
    }
    state.provider = wallets[0]?.provider || window.ethereum || null;
    if (!state.provider) {
      const target = location.href.replace(/^https?:\/\//, "");
      $("mm-link").href = `https://metamask.app.link/dapp/${target}`;
      $("cb-link").href = `https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(location.href)}`;
      $("no-wallet").hidden = false;
      setAction("NO WALLET FOUND", null, true);
      return;
    }
    setAction("CONNECT WALLET", connect);
  }

  init();
})();
