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
const recipient = must("#recipient", HTMLInputElement);
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
const gestureText = must("#gesture-text", HTMLElement);
const backTo = must("#back-to", HTMLElement);
const backKicker = must("#back-kicker", HTMLElement);
const backNote = must("#back-note", HTMLElement);
const usePostcard = must("#use-postcard", HTMLButtonElement);
const useFolded = must("#use-folded", HTMLButtonElement);
const formatNote = must("#format-note", HTMLElement);
const cardKind = must("#card-kind", HTMLElement);
const book = must("#book", HTMLButtonElement);
const flipBtn = must("#flip-btn", HTMLButtonElement);
const foldedImage = must("#folded-image", HTMLImageElement);
const foldedNote = must("#folded-note", HTMLElement);
const foldedCaption = must("#folded-caption", HTMLElement);
const foldedTo = must("#folded-to", HTMLElement);
const foldedKicker = must("#folded-kicker", HTMLElement);
const foldedLead = must("#folded-lead", HTMLElement);
const foldedAlso = must("#folded-also", HTMLElement);
const altA = must("#alt-a", HTMLElement);
const altALabel = must("#alt-a-label", HTMLElement);
const altACopy = must("#alt-a-copy", HTMLElement);
const altB = must("#alt-b", HTMLElement);
const altBLabel = must("#alt-b-label", HTMLElement);
const altBCopy = must("#alt-b-copy", HTMLElement);
const addressToggle = must("#address-toggle", HTMLButtonElement);
const addressFields = must("#address-fields", HTMLElement);
const addressNote = must("#address-note", HTMLElement);
const shipName = must("#ship-name", HTMLInputElement);
const shipStreet = must("#ship-street", HTMLInputElement);
const shipCity = must("#ship-city", HTMLInputElement);
const shipRegion = must("#ship-region", HTMLInputElement);
const shipPostal = must("#ship-postal", HTMLInputElement);
const shipCountry = must("#ship-country", HTMLSelectElement);
const addressBlock = must("#address-block", HTMLElement);
const addressLines = must("#address-lines", HTMLElement);
const addrName = must("#addr-name", HTMLElement);
const addrStreet = must("#addr-street", HTMLElement);
const addrCityline = must("#addr-cityline", HTMLElement);
const addrCountry = must("#addr-country", HTMLElement);
const envelope = must("#envelope", HTMLElement);
const envAddress = must("#env-address", HTMLElement);
const pay = must("#pay", HTMLButtonElement);
const subscribe = must("#subscribe", HTMLButtonElement);
const edit = must("#edit", HTMLElement);
const swatches = must("#swatches", HTMLElement);
const editColor = must("#edit-color", HTMLInputElement);
const editNote = must("#edit-note", HTMLInputElement);
const editImage = must("#edit-image", HTMLButtonElement);
const editStatus = must("#edit-status", HTMLElement);
const restoreImage = must("#restore-image", HTMLButtonElement);
/** @type {"postcard" | "folded"} */
let format = "postcard";
let postcardTrimmed = false;
/** @type {{ level2: string, level6: string, level10: string, score: number }} */
let apologies = { level2: "", level6: "", level10: "", score: 7 };

/** @type {string} */
let chosenColor = "";
/** @type {string} */
let originalImageUrl = "";
let editToken = 0;
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
  postcard.classList.remove("is-flipped", "is-peeking", "is-turning");
  postcard.setAttribute("aria-pressed", "false");
  book.classList.remove("is-open");
  book.setAttribute("aria-pressed", "false");
  flipHint.textContent = format === "folded" ? "Open the card" : "Flip the card";
  mail.hidden = true;
  edit.hidden = true;
  serious.hidden = true;
  score.textContent = "...";
  scoreNote.textContent = waiting[Math.floor(Math.random() * waiting.length)];
  fill.style.width = "12%";
  statusLine.textContent = "Deliberating.";

  try {
    const response = await fetch("/api/confess", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        confession: text,
        recipient: recipient.value.trim(),
      }),
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
  apologies = {
    level2: data.level2 || "",
    level6: data.level6 || "",
    level10: data.level10 || "",
    score: value,
  };
  const caption = data.gesture || "A handwritten note and a snack.";
  gestureText.textContent = caption;
  foldedCaption.textContent = caption;
  if (data.imageUrl) {
    showPicture(data.imageUrl, data.gesture || "The object to hand over");
    mail.hidden = false;
    originalImageUrl = data.imageUrl;
    editNote.value = "";
    clearColorChoice();
    editStatus.textContent = "";
    restoreImage.hidden = true;
    edit.hidden = false;
  } else {
    clearPicture(data.imageError || "");
    mail.hidden = true;
    originalImageUrl = "";
    edit.hidden = true;
  }
  gesture.hidden = false;
  paintCopy();
  if (format === "postcard") startPeek();
}

function clearColorChoice() {
  chosenColor = "";
  for (const button of swatches.querySelectorAll("button")) {
    button.setAttribute("aria-pressed", "false");
  }
  editColor.closest("label")?.classList.remove("is-chosen");
}

/**
 * @param {string} url
 * @param {string} alt
 */
function showPicture(url, alt) {
  for (const img of [image, foldedImage]) {
    img.src = url;
    img.alt = alt;
    img.hidden = false;
  }
  imageNote.hidden = true;
  foldedNote.hidden = true;
}

/** @param {string} error */
function clearPicture(error) {
  for (const img of [image, foldedImage]) {
    img.removeAttribute("src");
    img.hidden = true;
  }
  imageNote.hidden = !error;
  foldedNote.hidden = !error;
  imageNote.textContent = error;
  foldedNote.textContent = error;
}

/** @param {string} text */
function setPhotoWait(text) {
  const waiting = text !== "";
  for (const node of document.querySelectorAll(".photo")) {
    node.classList.toggle("is-editing", waiting);
  }
  for (const node of document.querySelectorAll(".photo-wait")) {
    if (!(node instanceof HTMLElement)) continue;
    node.hidden = !waiting;
    if (waiting) node.textContent = text;
  }
}

/**
 * @param {string} text
 * @param {number} max
 */
function clip(text, max) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const last = cut.lastIndexOf(" ");
  const base = (last > max * 0.6 ? cut.slice(0, last) : cut).trim();
  return `${base}…`;
}

/**
 * Shrink handwriting until it fits. If it still spills, keep a readable
 * size and end the note where the card ends.
 * @param {HTMLElement} node
 * @param {string} text
 * @param {number} maxPx
 * @param {number} minPx
 */
function placeText(node, text, maxPx, minPx) {
  const clean = text.replace(/\s+/g, " ").trim();
  const tooTall = () => node.scrollHeight > node.clientHeight + 1;
  node.style.fontSize = `${maxPx}px`;
  node.textContent = clean;
  if (node.clientHeight < 8) return { trimmed: false, skipped: true };
  let size = maxPx;
  while (size > minPx && tooTall()) {
    size -= 1;
    node.style.fontSize = `${size}px`;
  }
  if (!tooTall()) return { trimmed: false, skipped: false };
  const words = clean.split(" ").filter(Boolean);
  let low = 0;
  let high = words.length;
  let best = 0;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    node.textContent =
      mid >= words.length ? clean : `${words.slice(0, mid).join(" ")}…`;
    if (!tooTall()) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  if (best === 0) node.textContent = "…";
  else if (best >= words.length) node.textContent = clean;
  else node.textContent = `${words.slice(0, best).join(" ")}…`;
  return { trimmed: best < words.length, skipped: false };
}

function describeFormat() {
  const folded = format === "folded";
  formatNote.textContent = folded
    ? "It opens on the fold, with room for every version of the apology."
    : postcardTrimmed
      ? "Shortened to fit the postcard. A folded card keeps the whole apology."
      : "One note fits on the back. A folded card opens up for the rest.";
  useFolded.classList.toggle("is-suggested", !folded && postcardTrimmed);
}

function chosenApology() {
  const ladder = [
    { label: "Barely sorry", text: apologies.level2, max: 4 },
    { label: "A proper sorry", text: apologies.level6, max: 7 },
    { label: "The full apology", text: apologies.level10, max: 10 },
  ];
  const lead =
    ladder.find((item) => apologies.score <= item.max && item.text) ||
    ladder.find((item) => item.text) ||
    ladder[1];
  return { lead, rest: ladder.filter((item) => item !== lead && item.text) };
}

function paintCopy() {
  const { lead, rest } = chosenApology();
  const greeting = recipient.value.trim();
  const dear = greeting ? `Dear ${greeting},` : "";
  backTo.hidden = !dear;
  foldedTo.hidden = !dear;
  backTo.textContent = dear;
  foldedTo.textContent = dear;
  backKicker.textContent = lead.label;
  backNote.dataset.copy = lead.text;
  backNote.textContent = clip(lead.text, 140);
  foldedKicker.textContent = lead.label;
  foldedLead.dataset.copy = lead.text;
  foldedLead.textContent = clip(lead.text, 420);
  foldedAlso.hidden = rest.length === 0;
  const slots = [
    { line: altA, label: altALabel, copy: altACopy },
    { line: altB, label: altBLabel, copy: altBCopy },
  ];
  slots.forEach((slot, index) => {
    const item = rest[index];
    slot.line.hidden = !item;
    slot.label.textContent = item ? item.label : "";
    slot.copy.dataset.copy = item ? item.text : "";
    slot.copy.textContent = item ? clip(item.text, 180) : "";
  });
  postcardTrimmed = false;
  describeFormat();
  refit();
}

function refit() {
  requestAnimationFrame(() => {
    if (format === "folded") {
      if (!book.hidden) {
        placeText(foldedLead, foldedLead.dataset.copy || "", 28, 16);
        placeText(altACopy, altACopy.dataset.copy || "", 22, 15);
        placeText(altBCopy, altBCopy.dataset.copy || "", 22, 15);
      }
      return;
    }
    if (postcard.hidden) return;
    const fitted = placeText(backNote, backNote.dataset.copy || "", 24, 20);
    if (fitted.skipped) return;
    postcardTrimmed = fitted.trimmed;
    describeFormat();
  });
}

function startPeek() {
  postcard.classList.add("is-new");
  flipBtn.classList.remove("is-fresh");
  void flipBtn.offsetWidth;
  flipBtn.classList.add("is-fresh");
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  postcard.classList.remove("is-peeking");
  void postcard.offsetWidth;
  postcard.classList.add("is-peeking");
}

function showPictureSide() {
  if (format === "folded") {
    book.classList.remove("is-open");
    book.setAttribute("aria-pressed", "false");
    book.setAttribute("aria-label", "Open the card");
    flipHint.textContent = "Open the card";
    return;
  }
  postcard.classList.remove("is-flipped", "is-peeking", "is-turning");
  postcard.setAttribute("aria-pressed", "false");
  postcard.setAttribute("aria-label", "Show the apology");
  flipHint.textContent = "Flip the card";
}

function turnCard() {
  postcard.classList.remove("is-peeking", "is-new");
  flipBtn.classList.remove("is-fresh");
  if (format === "folded") {
    const open = book.classList.toggle("is-open");
    book.setAttribute("aria-pressed", String(open));
    book.setAttribute("aria-label", open ? "Close the card" : "Open the card");
    flipHint.textContent = open ? "Close the card" : "Open the card";
    refit();
    return;
  }
  postcard.classList.add("is-turning");
  window.setTimeout(() => postcard.classList.remove("is-turning"), 950);
  const flipped = postcard.classList.toggle("is-flipped");
  postcard.setAttribute("aria-pressed", String(flipped));
  postcard.setAttribute(
    "aria-label",
    flipped ? "Show the picture" : "Show the apology",
  );
  flipHint.textContent = flipped ? "Show the picture" : "Flip the card";
}

/** @param {"postcard" | "folded"} next */
function setFormat(next) {
  format = next;
  const folded = next === "folded";
  usePostcard.setAttribute("aria-pressed", String(!folded));
  useFolded.setAttribute("aria-pressed", String(folded));
  postcard.hidden = folded;
  book.hidden = !folded;
  postcard.classList.remove("is-flipped", "is-peeking", "is-turning");
  postcard.setAttribute("aria-pressed", "false");
  book.classList.remove("is-open");
  book.setAttribute("aria-pressed", "false");
  cardKind.textContent = folded ? "Folded card" : "Postcard";
  describeFormat();
  flipHint.textContent = folded ? "Open the card" : "Flip the card";
  postcard.setAttribute("aria-label", "Show the apology");
  book.setAttribute("aria-label", "Open the card");
  paintAddress();
  refit();
}

function addressOn() {
  return addressToggle.getAttribute("aria-expanded") === "true";
}

function paintAddress() {
  const name = shipName.value.trim();
  const street = shipStreet.value.trim();
  const cityline = [
    shipCity.value.trim(),
    shipRegion.value.trim(),
    shipPostal.value.trim(),
  ]
    .filter(Boolean)
    .join(" ");
  const country = shipCountry.selectedOptions[0]?.textContent || "";
  const filled = addressOn() && Boolean(name || street || cityline);
  addrName.textContent = filled ? name : "";
  addrStreet.textContent = filled ? street : "";
  addrCityline.textContent = filled ? cityline : "";
  addrCountry.textContent = filled ? country : "";
  addressBlock.hidden = !filled;
  addressLines.hidden = filled;
  envelope.hidden = !(format === "folded" && filled);
  envAddress.textContent = [name, street, cityline, country]
    .filter(Boolean)
    .join("\n");
  addressNote.textContent =
    format === "folded"
      ? "This prints on the envelope."
      : "This prints on the back of the postcard.";
}

/**
 * @returns {{
 *   error?: string,
 *   address?: {
 *     name: string,
 *     street: string,
 *     city: string,
 *     region: string,
 *     postal: string,
 *     country: string,
 *   },
 * }}
 */
function mailingAddress() {
  if (!addressOn()) return {};
  const address = {
    name: shipName.value.trim(),
    street: shipStreet.value.trim(),
    city: shipCity.value.trim(),
    region: shipRegion.value.trim(),
    postal: shipPostal.value.trim(),
    country: shipCountry.value,
  };
  if (!address.name || !address.street || !address.city || !address.postal) {
    return {
      error:
        "Add a name, street, city, and postal code, or leave the address off.",
    };
  }
  return { address };
}

/**
 * @param {string} text
 */
function setEditStatus(text) {
  editStatus.textContent = text;
  statusLine.textContent = text;
}

/**
 * @param {{ color?: string, note?: string }} change
 */
async function runEdit(change) {
  const imageUrl = image.getAttribute("src");
  const color = change.color || "";
  const note = (change.note || "").trim();
  if (!imageUrl) return;
  if (!color && !note) {
    setEditStatus("Pick a color or describe the change.");
    return;
  }

  const token = ++editToken;
  showPictureSide();
  const waiting =
    color && !note ? "Changing the color…" : "Changing the picture…";
  editImage.disabled = true;
  setPhotoWait(waiting);
  setEditStatus(waiting);
  try {
    const response = await fetch("/api/edit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ imageUrl, color, note }),
    });
    const data = await response.json();
    if (token !== editToken) return;
    if (!response.ok || !data.imageUrl) {
      throw new Error(data.error || "Ideogram could not change the picture.");
    }
    const previous = image.getAttribute("src") || "";
    showPicture(data.imageUrl, image.alt);
    try {
      await Promise.all([image.decode(), foldedImage.decode()]);
    } catch {
      if (token !== editToken) return;
      if (previous) showPicture(previous, image.alt);
      throw new Error("The new picture did not load.");
    }
    if (token !== editToken) return;
    restoreImage.hidden = false;
    setEditStatus("Picture changed.");
  } catch (error) {
    if (token !== editToken) return;
    setEditStatus(messageFrom(error, "Ideogram could not change the picture."));
  } finally {
    if (token === editToken) {
      editImage.disabled = false;
      setPhotoWait("");
    }
  }
}

swatches.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const button = target.closest("button");
  if (!(button instanceof HTMLButtonElement) || !button.dataset.color) return;
  const turningOff = button.getAttribute("aria-pressed") === "true";
  clearColorChoice();
  if (turningOff) return;
  chosenColor = button.dataset.color;
  button.setAttribute("aria-pressed", "true");
  editColor.value = chosenColor;
  runEdit({ color: chosenColor });
});

editColor.addEventListener("input", () => {
  for (const button of swatches.querySelectorAll("button")) {
    button.setAttribute("aria-pressed", "false");
  }
  chosenColor = editColor.value;
  editColor.closest("label")?.classList.add("is-chosen");
});

editColor.addEventListener("change", () => {
  if (!chosenColor) return;
  if (swatches.querySelector('button[aria-pressed="true"]')) return;
  runEdit({ color: chosenColor });
});

editImage.addEventListener("click", () => {
  runEdit({ color: chosenColor, note: editNote.value.trim() });
});

restoreImage.addEventListener("click", () => {
  if (!originalImageUrl) return;
  showPicture(originalImageUrl, image.alt);
  restoreImage.hidden = true;
  setEditStatus("First picture.");
});

postcard.addEventListener("click", () => turnCard());
book.addEventListener("click", () => turnCard());
flipBtn.addEventListener("click", () => turnCard());
usePostcard.addEventListener("click", () => setFormat("postcard"));
useFolded.addEventListener("click", () => setFormat("folded"));

postcard.addEventListener("animationend", (event) => {
  if (event.animationName !== "card-show") return;
  postcard.classList.remove("is-peeking");
});

flipBtn.addEventListener("animationend", (event) => {
  if (event.animationName !== "nudge") return;
  flipBtn.classList.remove("is-fresh");
});

addressToggle.addEventListener("click", () => {
  const open = addressToggle.getAttribute("aria-expanded") !== "true";
  addressToggle.setAttribute("aria-expanded", String(open));
  addressFields.hidden = !open;
  addressToggle.textContent = open
    ? "Remove mailing address"
    : "Add a mailing address";
  if (open && format === "postcard") {
    postcard.classList.remove("is-peeking", "is-new");
    postcard.classList.add("is-flipped");
    postcard.setAttribute("aria-pressed", "true");
    postcard.setAttribute("aria-label", "Show the picture");
    flipHint.textContent = "Show the picture";
  }
  if (open && !shipName.value.trim()) {
    shipName.value = recipient.value.trim();
  }
  paintAddress();
  if (open) shipName.focus();
});

recipient.addEventListener("input", () => {
  if (!gesture.hidden) paintCopy();
});

for (const field of [shipName, shipStreet, shipCity, shipRegion, shipPostal]) {
  field.addEventListener("input", paintAddress);
}
shipCountry.addEventListener("change", paintAddress);

const fitter = new ResizeObserver(() => {
  if (!gesture.hidden) refit();
});
fitter.observe(postcard);
fitter.observe(book);
document.fonts?.ready.then(() => {
  if (!gesture.hidden) refit();
});

/**
 * @param {Record<string, unknown>} body
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
  const mailing = mailingAddress();
  if (mailing.error) {
    statusLine.textContent = mailing.error;
    return;
  }
  openCheckout(
    {
      plan: "mail",
      gesture: gestureText.textContent || "",
      imageUrl,
      ...(mailing.address ? { address: mailing.address } : {}),
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
        const place = [data.city, data.country].filter(Boolean).join(", ");
        const recipient = data.recipient || "";
        if (!place && !recipient && !data.mail) return;
        const speed = data.mail ? `${data.mail}. ` : "";
        const sent = recipient
          ? `Addressed to ${recipient}${place ? ` in ${place}` : ""}.`
          : place
            ? `Mailing to ${place}.`
            : "";
        paid.textContent = `Print ordered. ${speed}${sent}`.trim();
      })
      .catch(() => {});
  }
}
