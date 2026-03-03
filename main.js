const form = document.getElementById("auditForm");
const statusNode = document.getElementById("formStatus");
const yearNode = document.getElementById("year");

if (yearNode) {
  yearNode.textContent = new Date().getFullYear();
}

const revealItems = document.querySelectorAll(".reveal");
const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        observer.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.18 }
);

revealItems.forEach((item) => observer.observe(item));

if (form) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    statusNode.textContent = "";
    statusNode.className = "form-status";

    const formData = new FormData(form);
    const email = String(formData.get("email") || "").trim();
    const phone = String(formData.get("phone") || "").trim();
    const website = String(formData.get("website") || "").trim();

    if (website) {
      statusNode.textContent = "Submission blocked.";
      statusNode.classList.add("error");
      return;
    }

    if (!email || !phone) {
      statusNode.textContent = "Please provide both email and phone number.";
      statusNode.classList.add("error");
      return;
    }

    const phonePattern = /^\+?[0-9\s-]{8,20}$/;
    if (!phonePattern.test(phone)) {
      statusNode.textContent = "Please enter a valid phone number.";
      statusNode.classList.add("error");
      return;
    }

    try {
      // Replace this with your backend/CRM endpoint when ready.
      // Kept local and lightweight for now.
      await new Promise((resolve) => setTimeout(resolve, 350));

      if (typeof window.fbq === "function") {
        window.fbq("track", "Lead", {
          content_name: "Free Growth Audit",
          status: "submitted"
        });
      }

      statusNode.textContent = "Thanks! We received your details and will contact you shortly.";
      statusNode.classList.add("success");
      form.reset();
    } catch (error) {
      statusNode.textContent = "Something went wrong. Please try again.";
      statusNode.classList.add("error");
    }
  });
}
