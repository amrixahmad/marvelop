const form = document.getElementById("guideForm");
const statusNode = document.getElementById("formStatus");
const submitBtn = document.getElementById("submitBtn");
const yearNode = document.getElementById("year");
const thankYouEmailNode = document.getElementById("thankYouEmail");

if (yearNode) {
  yearNode.textContent = new Date().getFullYear();
}

if (thankYouEmailNode) {
  try {
    const storedLead = sessionStorage.getItem("marvelopLead");

    if (storedLead) {
      const lead = JSON.parse(storedLead);

      if (lead.email) {
        thankYouEmailNode.textContent = lead.email;
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
    const name = String(formData.get("name") || "").trim();
    const email = String(formData.get("email") || "").trim();
    const phone = String(formData.get("phone") || "").trim();
    const hpField = String(formData.get("hp_field") || "").trim();

    if (hpField) {
      statusNode.textContent = "Submission blocked.";
      statusNode.classList.add("error");
      return;
    }

    if (!name || !email || !phone) {
      statusNode.textContent = "Please fill in your name, email, and WhatsApp number.";
      statusNode.classList.add("error");
      return;
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(email)) {
      statusNode.textContent = "Please enter a valid email address.";
      statusNode.classList.add("error");
      return;
    }

    const phonePattern = /^\+?[0-9\s-]{8,20}$/;
    if (phone && !phonePattern.test(phone)) {
      statusNode.textContent = "Please enter a valid phone number, or leave it empty.";
      statusNode.classList.add("error");
      return;
    }

    submitBtn.disabled = true;

    try {
      const response = await fetch(form.action, {
        method: "POST",
        body: formData,
        headers: {
          Accept: "application/json"
        }
      });

      if (!response.ok) {
        throw new Error("Submission failed");
      }

      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({
        event: "lead_form_success",
        form_name: "marvelop_growth_review",
        name,
        email,
        phone
      });

      sessionStorage.setItem(
        "marvelopLead",
        JSON.stringify({
          name,
          email,
          phone
        })
      );

      statusNode.textContent = "Sent! Taking you to your guide...";
      statusNode.classList.add("success");
      form.reset();
      window.setTimeout(() => {
        window.location.href = "thank-you.html";
      }, 450);
    } catch (error) {
      submitBtn.disabled = false;
      statusNode.textContent = "Something went wrong. Please try again.";
      statusNode.classList.add("error");
    }
  });
}
