import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** @param {string} file */
function loadEnv(file) {
  if (!existsSync(file)) return {};
  return Object.fromEntries(
    readFileSync(file, "utf8")
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const index = line.indexOf("=");
        let value = line.slice(index + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        return [line.slice(0, index).trim(), value];
      }),
  );
}

const env = {
  ...loadEnv(join(import.meta.dirname, "..", ".env")),
  ...process.env,
};

const stripeKey = env.STRIPE_SECRET_KEY || "";

export const printOrder = {
  name: "Printed peace offering",
  amount: 1200,
  currency: "usd",
};

export const membership = {
  name: "Sorryometer Bureau",
  description: "A new Ideogram postcard every month.",
  amount: 800,
  currency: "usd",
  interval: "month",
};

const mailRates = [
  { name: "Standard mail", amount: 600, min: 5, max: 8 },
  { name: "Overnight regret", amount: 1800, min: 1, max: 2 },
];

/** @param {unknown} value */
function cleanGesture(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

/** @param {unknown} value */
function cleanImage(value) {
  const url = String(value || "").trim();
  if (!url.startsWith("https://") || url.length > 1800) return "";
  return url;
}

/**
 * @param {{ origin?: unknown, gesture?: unknown, imageUrl?: unknown, plan?: unknown }} input
 */
export async function createCheckout({ origin, gesture, imageUrl, plan }) {
  if (!stripeKey) {
    throw Object.assign(new Error("Stripe sandbox key is not configured."), {
      status: 500,
    });
  }
  const base = String(origin || "").replace(/\/$/, "");
  if (!base.startsWith("http")) {
    throw Object.assign(new Error("Checkout needs a return address."), {
      status: 400,
    });
  }
  if (plan === "subscribe") {
    return postSession(
      new URLSearchParams({
        mode: "subscription",
        "line_items[0][quantity]": "1",
        "line_items[0][price_data][currency]": membership.currency,
        "line_items[0][price_data][unit_amount]": String(membership.amount),
        "line_items[0][price_data][recurring][interval]": membership.interval,
        "line_items[0][price_data][product_data][name]": membership.name,
        "line_items[0][price_data][product_data][description]":
          membership.description,
        success_url: `${base}/?subscribed=1`,
        cancel_url: `${base}/?canceled=1`,
      }),
    );
  }
  const picture = cleanImage(imageUrl);
  const offering = cleanGesture(gesture) || "the peace offering";
  if (!picture) {
    throw Object.assign(new Error("Mailing needs the Ideogram picture."), {
      status: 400,
    });
  }

  const body = new URLSearchParams({
    mode: "payment",
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": printOrder.currency,
    "line_items[0][price_data][unit_amount]": String(printOrder.amount),
    "line_items[0][price_data][product_data][name]": printOrder.name,
    "line_items[0][price_data][product_data][description]": `A mailed print of the Ideogram picture: ${offering}.`,
    "line_items[0][price_data][product_data][images][0]": picture,
    "shipping_address_collection[allowed_countries][0]": "US",
    "shipping_address_collection[allowed_countries][1]": "CA",
    "shipping_address_collection[allowed_countries][2]": "GB",
    "shipping_address_collection[allowed_countries][3]": "AU",
    "custom_text[shipping_address][message]": "Where should we mail the print?",
    "metadata[gesture]": offering,
    success_url: `${base}/?mailed=1&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/?canceled=1`,
  });
  if (picture.length <= 500) body.set("metadata[image_url]", picture);
  mailRates.forEach((rate, index) => {
    const prefix = `shipping_options[${index}][shipping_rate_data]`;
    body.set(`${prefix}[type]`, "fixed_amount");
    body.set(`${prefix}[display_name]`, rate.name);
    body.set(`${prefix}[fixed_amount][amount]`, String(rate.amount));
    body.set(`${prefix}[fixed_amount][currency]`, printOrder.currency);
    body.set(`${prefix}[delivery_estimate][minimum][unit]`, "business_day");
    body.set(`${prefix}[delivery_estimate][minimum][value]`, String(rate.min));
    body.set(`${prefix}[delivery_estimate][maximum][unit]`, "business_day");
    body.set(`${prefix}[delivery_estimate][maximum][value]`, String(rate.max));
  });

  try {
    return await postSession(body);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "";
    if (!picture || !/image/i.test(detail)) throw error;
    body.delete("line_items[0][price_data][product_data][images][0]");
    return postSession(body);
  }
}

/** @param {URLSearchParams} body */
async function postSession(body) {
  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${stripeKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    signal: AbortSignal.timeout(20000),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.url) {
    const message = payload.error?.message || "Stripe could not open checkout.";
    throw Object.assign(new Error(message), { status: response.status || 502 });
  }
  return { url: payload.url };
}

/** @param {unknown} sessionId */
export async function retrieveOrder(sessionId) {
  const id = String(sessionId || "");
  if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(id)) {
    throw Object.assign(new Error("Unknown order."), { status: 400 });
  }
  if (!stripeKey) {
    throw Object.assign(new Error("Stripe sandbox key is not configured."), {
      status: 500,
    });
  }

  const response = await fetch(
    `https://api.stripe.com/v1/checkout/sessions/${id}?expand[]=shipping_cost.shipping_rate`,
    {
      headers: { Authorization: `Bearer ${stripeKey}` },
      signal: AbortSignal.timeout(20000),
    },
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      payload.error?.message || "Stripe could not find that order.";
    throw Object.assign(new Error(message), { status: response.status || 502 });
  }
  if (payload.payment_status !== "paid") {
    throw Object.assign(new Error("This print has not been paid."), {
      status: 402,
    });
  }

  const address =
    payload.collected_information?.shipping_details?.address ||
    payload.shipping_details?.address ||
    {};
  const rate = payload.shipping_cost?.shipping_rate;
  return {
    city: address.city || "",
    country: address.country || "",
    mail: rate && typeof rate === "object" ? rate.display_name || "" : "",
  };
}
