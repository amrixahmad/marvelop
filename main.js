const form = document.getElementById("auditForm");
const statusNode = document.getElementById("formStatus");
const yearNode = document.getElementById("year");
const thankYouCompanyNode = document.getElementById("thankYouCompany");
const thankYouBudgetNode = document.getElementById("thankYouBudget");

if (yearNode) {
  yearNode.textContent = new Date().getFullYear();
}

if (thankYouCompanyNode || thankYouBudgetNode) {
  try {
    const storedLead = sessionStorage.getItem("marvelopLead");

    if (storedLead) {
      const lead = JSON.parse(storedLead);

      if (thankYouCompanyNode && lead.company) {
        thankYouCompanyNode.textContent = lead.company;
      }

      if (thankYouBudgetNode && lead.budget) {
        thankYouBudgetNode.textContent = lead.budget;
      }
    }
  } catch (error) {
  }
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
    const company = String(formData.get("company") || "").trim();
    const email = String(formData.get("email") || "").trim();
    const phone = String(formData.get("phone") || "").trim();
    const budget = String(formData.get("budget") || "").trim();
    const website = String(formData.get("website") || "").trim();

    if (website) {
      statusNode.textContent = "Submission blocked.";
      statusNode.classList.add("error");
      return;
    }

    if (!company || !email || !phone || !budget) {
      statusNode.textContent = "Please complete all form fields before continuing.";
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
          content_name: "Meta Ads Growth Review",
          status: "submitted"
        });
      }

      sessionStorage.setItem(
        "marvelopLead",
        JSON.stringify({
          company,
          email,
          phone,
          budget
        })
      );

      statusNode.textContent = "Thanks! Taking you to the next step...";
      statusNode.classList.add("success");
      form.reset();
      window.setTimeout(() => {
        window.location.href = "thank-you.html";
      }, 450);
    } catch (error) {
      statusNode.textContent = "Something went wrong. Please try again.";
      statusNode.classList.add("error");
    }
  });
}
