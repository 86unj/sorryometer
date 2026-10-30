const form = document.querySelector("#case");
const confession = document.querySelector("#confession");
const status = document.querySelector("#status");
const score = document.querySelector("#score");
const scoreNote = document.querySelector("#score-note");
const fill = document.querySelector("#fill");
const cards = document.querySelector("#cards");
const gesture = document.querySelector("#gesture");
const serious = document.querySelector("#serious");
const submit = form.querySelector(".submit");

const notes = [
  "Barely a crime",
  "Awkward, survivable",
  "The group chat knows",
  "Bring pastries",
  "A holiday has been declared",
];

const waiting = [
  "Consulting the pastry tribunal...",
  "Tuning the apology orchestra...",
  "Inflating a small amount of shame...",
  "Asking Ideogram to photograph the evidence...",
];

document.querySelector("#starters").addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  confession.value = button.textContent;
  confession.focus();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = confession.value.trim();
  if (!text) return;

  submit.disabled = true;
  cards.hidden = true;
  gesture.hidden = true;
  serious.hidden = true;
  score.textContent = "...";
  scoreNote.textContent = waiting[Math.floor(Math.random() * waiting.length)];
  fill.style.width = "12%";
  status.textContent = "The bureau is deliberating.";

  try {
    const response = await fetch("/api/confess", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confession: text }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "The booth jammed.");
    render(data);
    status.textContent = "Verdict delivered.";
  } catch (error) {
    score.textContent = "!";
    scoreNote.textContent = "Case dismissed";
    fill.style.width = "0";
    status.textContent = error.message;
  } finally {
    submit.disabled = false;
  }
});

function render(data) {
  const seriousCase = data.score === 0 || (!data.level2 && !data.level10);
  if (seriousCase) {
    score.textContent = "0";
    scoreNote.textContent = "Not a bit";
    fill.style.width = "0";
    serious.hidden = false;
    serious.textContent = data.raw;
    return;
  }

  const value = Math.max(1, Math.min(10, data.score || 7));
  score.textContent = String(value);
  scoreNote.textContent = notes[Math.min(notes.length - 1, Math.ceil(value / 2) - 1)];
  fill.style.width = `${value * 10}%`;
  document.querySelector("#level2").textContent = data.level2;
  document.querySelector("#level6").textContent = data.level6;
  document.querySelector("#level10").textContent = data.level10;
  document.querySelector("#gesture-text").textContent = data.gesture || "A handwritten note and a snack.";
  const image = document.querySelector("#gesture-image");
  const imageNote = document.querySelector("#image-note");
  if (data.imageUrl) {
    image.src = data.imageUrl;
    image.alt = data.gesture || "The object to hand over";
    image.hidden = false;
    imageNote.hidden = true;
  } else {
    image.removeAttribute("src");
    image.hidden = true;
    imageNote.hidden = !data.imageError;
    imageNote.textContent = data.imageError || "";
  }
  cards.hidden = false;
  gesture.hidden = false;
}
