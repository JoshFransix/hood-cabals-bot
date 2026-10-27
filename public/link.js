(() => {
  const $ = (id) => document.getElementById(id);
  const nonce = new URLSearchParams(location.search).get("n") || "";
  const state = { step: 1, address: null, message: null, botUsername: null };

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

  async function connect() {
    fail("");
    setAction("CONNECTING…", null, true);
    try {
      const [address] = await window.ethereum.request({ method: "eth_requestAccounts" });
      state.address = address;
      $("connect-copy").innerHTML = `Connected <code>${address.slice(0, 6)}…${address.slice(-4)}</code>`;
      setStep(2);
      setAction("SIGN MESSAGE", sign);
    } catch (err) {
      fail(err?.code === 4001 ? "Connection rejected in your wallet." : "Couldn't connect. Try again.");
      setAction("CONNECT WALLET", connect);
    }
  }

  async function sign() {
    fail("");
    setAction("WAITING FOR SIGNATURE…", null, true);
    let signature;
    try {
      signature = await window.ethereum.request({
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

    if (!window.ethereum) {
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
