import { describe, expect, it } from "vitest";
import { mailtoHref, toTemplateParams } from "./enquiry";
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

  /* Every field is visitor-supplied, and a raw `&` or newline in one would open
     a second mailto header — a `cc:` or a `bcc:` the visitor never wrote. */
  it("cannot be made to carry a second mailto header", () => {
    const href = mailtoHref("info@code.sydney", {
      ...enquiry,
      name: "Ada&bcc=someone@example.com",
      message: "hello\r\nbcc: someone@example.com",
    });

    expect(href.split("&").length).toBe(2); // subject and body, and nothing else
    expect(href).not.toContain("bcc=someone@example.com");
  });
});
