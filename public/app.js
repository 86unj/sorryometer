/**
 * @template {Element} T
 * @param {string} selector
 * @param {new (...args: never[]) => T} type
 * @returns {T}
 */
function must(selector, type) {
  const node = document.querySelector(selector);
  if (!(node instanceof type)) throw new Error(`Missing ${selector}`);
  return node;
}

/**
 * @param {unknown} error
 * @param {string} fallback
 */
function messageFrom(error, fallback) {
  return error instanceof Error && error.message ? error.message : fallback;
}

const form = must("#case", HTMLFormElement);
const confession = must("#confession", HTMLTextAreaElement);
const statusLine = must("#status", HTMLElement);
const score = must("#score", HTMLElement);
const scoreNote = must("#score-note", HTMLElement);
const fill = must("#fill", HTMLElement);
const gesture = must("#gesture", HTMLElement);
const postcard = must("#postcard", HTMLButtonElement);
const flipHint = must("#flip-hint", HTMLElement);
const serious = must("#serious", HTMLElement);
const submit = must("#case button.submit", HTMLButtonElement);
const starters = must("#starters", HTMLElement);
const mail = must("#mail", HTMLElement);
const image = must("#gesture-image", HTMLImageElement);
const imageNote = must("#image-note", HTMLElement);
const level2 = must("#level2", HTMLElement);
const level6 = must("#level6", HTMLElement);
const level10 = must("#level10", HTMLElement);
const gestureText = must("#gesture-text", HTMLElement);
const pay = must("#pay", HTMLButtonElement);
const subscribe = must("#subscribe", HTMLButtonElement);
const paid = must("#paid", HTMLElement);
const subscribed = must("#subscribed", HTMLElement);
const canceled = must("#canceled", HTMLElement);

const notes = [
  "Barely a crime",
  "Awkward, survivable",
  "The group chat knows",
  "Bring pastries",
  "A holiday has been declared",
];

const waiting = ["Writing apologies...", "Drawing the peace offering..."];

starters.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const button = target.closest("button");
  if (!(button instanceof HTMLButtonElement)) return;
  confession.value = button.textContent || "";
  confession.focus();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = confession.value.trim();
  if (!text) return;

  submit.disabled = true;
  gesture.hidden = true;
  postcard.classList.remove("is-flipped");
  postcard.setAttribute("aria-pressed", "false");
  flipHint.textContent = "Flip for the apology";
  mail.hidden = true;
  serious.hidden = true;
  score.textContent = "...";
  scoreNote.textContent = waiting[Math.floor(Math.random() * waiting.length)];
  fill.style.width = "12%";
  statusLine.textContent = "Deliberating.";

  try {
    const response = await fetch("/api/confess", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confession: text }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "The booth jammed.");
    render(data);
    statusLine.textContent = "Done.";
  } catch (error) {
    score.textContent = "!";
    scoreNote.textContent = "Case dismissed";
    fill.style.width = "0";
    statusLine.textContent = messageFrom(error, "The booth jammed.");
  } finally {
    submit.disabled = false;
  }
});

/**
 * @param {{
 *   score?: number | null,
 *   level2?: string,
 *   level6?: string,
 *   level10?: string,
 *   gesture?: string,
 *   raw?: string,
 *   imageUrl?: string | null,
 *   imageError?: string
 * }} data
 */
function render(data) {
  const seriousCase = data.score === 0 || (!data.level2 && !data.level10);
  if (seriousCase) {
    score.textContent = "0";
    scoreNote.textContent = "Not a bit";
    fill.style.width = "0";
    serious.hidden = false;
    serious.textContent = data.raw || "";
    return;
  }

  const value = Math.max(1, Math.min(10, data.score || 7));
  score.textContent = String(value);
  scoreNote.textContent =
    notes[Math.min(notes.length - 1, Math.ceil(value / 2) - 1)];
  fill.style.width = `${value * 10}%`;
  level2.textContent = data.level2 || "";
  level6.textContent = data.level6 || "";
  level10.textContent = data.level10 || "";
  gestureText.textContent = data.gesture || "A handwritten note and a snack.";
  if (data.imageUrl) {
    image.src = data.imageUrl;
    image.alt = data.gesture || "The object to hand over";
    image.hidden = false;
    imageNote.hidden = true;
    mail.hidden = false;
  } else {
    image.removeAttribute("src");
    image.hidden = true;
    imageNote.hidden = !data.imageError;
    imageNote.textContent = data.imageError || "";
    mail.hidden = true;
  }
  gesture.hidden = false;
}

postcard.addEventListener("click", () => {
  const flipped = postcard.classList.toggle("is-flipped");
  postcard.setAttribute("aria-pressed", String(flipped));
  flipHint.textContent = flipped
    ? "Flip for the picture"
    : "Flip for the apology";
});

/**
 * @param {Record<string, string>} body
 * @param {HTMLButtonElement} button
 */
async function openCheckout(body, button) {
  button.disabled = true;
  statusLine.textContent = "Opening checkout.";
  try {
    const response = await fetch("/api/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok || !data.url) {
      throw new Error(data.error || "Checkout failed.");
    }
    window.location.href = data.url;
  } catch (error) {
    statusLine.textContent = messageFrom(error, "Checkout failed.");
    button.disabled = false;
  }
}

pay.addEventListener("click", () => {
  const imageUrl = image.getAttribute("src");
  if (!imageUrl) return;
  openCheckout(
    {
      plan: "mail",
      gesture: gestureText.textContent || "",
      imageUrl,
    },
    pay,
  );
});

subscribe.addEventListener("click", () => {
  openCheckout({ plan: "subscribe" }, subscribe);
});

const params = new URLSearchParams(window.location.search);
if (params.get("canceled") === "1") canceled.hidden = false;
if (params.get("subscribed") === "1") subscribed.hidden = false;
if (params.get("mailed") === "1") {
  paid.hidden = false;
  const sessionId = params.get("session_id");
  if (sessionId) {
    fetch(`/api/order?session_id=${encodeURIComponent(sessionId)}`)
      .then((response) =>
        response.json().then((data) => ({ ok: response.ok, data })),
      )
      .then(({ ok, data }) => {
        if (!ok) return;
        const where = [data.city, data.country].filter(Boolean).join(", ");
        if (!where) return;
        paid.textContent = data.mail
          ? `Print ordered. ${data.mail} to ${where}.`
          : `Print ordered. Mailing to ${where}.`;
      })
      .catch(() => {});
  }
}
