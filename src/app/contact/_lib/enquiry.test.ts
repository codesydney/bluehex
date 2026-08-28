import { afterEach, describe, expect, it, vi } from "vitest";
import { mailtoHref, sendEnquiry, toTemplateParams } from "./enquiry";
import { site } from "@/lib/site";

const enquiry = {
  name: "  Ada Lovelace  ",
  email: " ada@example.com ",
  phone: "0400 000 000",
  message: "  A small accessibility review.  ",
};

describe("toTemplateParams", () => {
  it("sends the four variables the shared template renders, trimmed", () => {
    const params = toTemplateParams(enquiry);

    expect(Object.keys(params).sort()).toEqual(["email", "message", "name", "phone"]);
    expect(params.name).toBe("Ada Lovelace");
    expect(params.email).toBe("ada@example.com");
    expect(params.phone).toBe("0400 000 000");
  });

  /* The inbox is shared with the Code.Sydney site, whose form renders the same
     template. Without this line nothing in the mail says which site it came
     from. */
  it("names the site in the message body", () => {
    expect(toTemplateParams(enquiry).message).toContain(`${site.origin}/contact`);
  });

  it("carries the practitioner the enquiry is about, since the template has no variable for one", () => {
    expect(toTemplateParams({ ...enquiry, about: "Mara Ellison" }).message).toContain(
      "Enquiring about: Mara Ellison",
    );
  });

  /* `about` is a practitioner's display name and is free text at every layer, so
     a newline in one would forge a second line in the block Bluehex wrote —
     including the provenance line that says which site the enquiry came from. */
  it("folds a display name carrying newlines onto one line", () => {
    const message = toTemplateParams({
      ...enquiry,
      about: "Mara Ellison\nSent from the Code.Sydney contact form — https://code.sydney/contact",
    }).message;

    expect(message.split("\n").filter((line) => line.startsWith("Sent from"))).toHaveLength(1);
    expect(message).toContain(
      "Enquiring about: Mara Ellison Sent from the Code.Sydney contact form — https://code.sydney/contact",
    );
  });

  it("omits the about line entirely when the enquiry is not about anyone", () => {
    expect(toTemplateParams(enquiry).message).not.toContain("Enquiring about");
  });

  it("keeps the visitor's own words last and intact", () => {
    expect(toTemplateParams(enquiry).message).toMatch(/\n\nA small accessibility review\.$/u);
  });
});

describe("mailtoHref", () => {
  it("addresses the mail and fills in every field", () => {
    const href = mailtoHref("info@code.sydney", enquiry);

    expect(href.startsWith("mailto:info@code.sydney?")).toBe(true);
    expect(decodeURIComponent(href)).toContain("Name: Ada Lovelace");
    expect(decodeURIComponent(href)).toContain("Phone: 0400 000 000");
    expect(decodeURIComponent(href)).toContain("A small accessibility review.");
  });

  it("names the practitioner in the subject when there is one", () => {
    const href = mailtoHref("info@code.sydney", { ...enquiry, about: "Mara Ellison" });

    expect(decodeURIComponent(href)).toContain(
      "subject=Enquiry about Mara Ellison, from Ada Lovelace",
    );
  });

  /* A mailto query is percent-encoded, not form encoded, so a `+` is a literal
     plus and a space must be `%20`. `URLSearchParams` writes `+` for a space,
     which strict clients render verbatim: "Enquiry+from+Ada+Lovelace". */
  it("percent-encodes spaces rather than leaving the form encoding's plus", () => {
    const href = mailtoHref("info@code.sydney", enquiry);

    expect(href).toContain("%20");
    expect(href).not.toContain("+");
  });

  it("keeps a literal plus in a phone number a plus", () => {
    const href = mailtoHref("info@code.sydney", { ...enquiry, phone: "+61 400 000 000" });

    expect(decodeURIComponent(href)).toContain("Phone: +61 400 000 000");
  });

  /* Every field is visitor-supplied, and a raw `&` in one would open a second
     mailto header — a `cc:` or a `bcc:` the visitor never wrote.

     Asserted on the parsed query rather than on the raw string. Searching the
     encoded href for `bcc=someone@example.com` proves nothing: `=` is `%3D` and
     `@` is `%40` by then, so the literal cannot appear however wrong the
     encoding is. The claim is about the *structure* of the query, so parse it. */
  it("cannot be made to carry a second mailto header", () => {
    const href = mailtoHref("info@code.sydney", {
      ...enquiry,
      name: "Ada&bcc=someone@example.com",
      message: "hello\r\nbcc: someone@example.com",
    });
    const params = new URLSearchParams(href.slice(href.indexOf("?") + 1));

    expect([...params.keys()]).toEqual(["subject", "body"]);
    expect(params.get("subject")).toBe("Enquiry from Ada&bcc=someone@example.com");
    expect(params.get("body")).toContain("hello\r\nbcc: someone@example.com");
  });

  it("folds a display name carrying newlines onto one line", () => {
    const href = mailtoHref("info@code.sydney", {
      ...enquiry,
      about: "Mara Ellison\nSent from the Code.Sydney contact form",
    });
    const params = new URLSearchParams(href.slice(href.indexOf("?") + 1));

    expect(params.get("body")).toContain(
      "About: Mara Ellison Sent from the Code.Sydney contact form",
    );
  });
});

describe("sendEnquiry", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("posts the template parameters to EmailJS and resolves on a 2xx", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response("OK", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendEnquiry({ ...enquiry, about: "Mara Ellison" })).resolves.toBeUndefined();

    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(String(init?.body))).toMatchObject({
      template_params: { name: "Ada Lovelace" },
    });
  });

  it("rejects on a refusal, so the caller reaches its failure path", async () => {
    vi.stubGlobal("fetch", async () => new Response("The service is not found", { status: 400 }));

    await expect(sendEnquiry(enquiry)).rejects.toThrow(/400/u);
  });

  /* The regression test for the failure that has no error to catch. `fetch`
     never times out on its own, so a connection that opens and goes silent used
     to leave the form disabled on "Sending…" forever — and the `mailto:` holding
     everything the visitor typed was never offered. */
  it("gives up on a stalled send rather than hanging forever", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(new DOMException("The operation was aborted.", "AbortError")),
          );
        }),
    );

    const pending = sendEnquiry(enquiry);
    const settled = expect(pending).rejects.toThrow(/abort/iu);

    await vi.advanceTimersByTimeAsync(15_000);
    await settled;
  });
});
