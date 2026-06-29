(function () {
  const email = "hello@brandbuddyy.com";
  const one = (selector, root = document) => root.querySelector(selector);
  const all = (selector, root = document) => [...root.querySelectorAll(selector)];
  const text = (selector, value, root = document) => {
    const element = one(selector, root);
    if (!element) return;
    element.textContent = value;
    element.classList.add("bb-replaced-title");
  };
  const texts = (selector, values, root = document) => {
    all(selector, root).forEach((element, index) => {
      if (values[index] !== undefined) {
        element.textContent = values[index];
        element.classList.add("bb-replaced-title");
      }
    });
  };
  const logo = () => '<span class="bb-logo"><span>brand</span><strong>buddyy.</strong></span>';

  const about = one(".as-about-1-area");
  const team = one(".as-team-1-area");
  const features = one(".as-features-1-area");
  const partners = one(".as-partner-1-area");
  const services = one(".as-services-1-area");
  const portfolio = one(".as-portfolio-1-area");
  const testimonial = one(".as-testimonial-1-area");
  const pricing = one(".as-price-1-area");
  const process = one(".as-process-1-area");
  const faqs = one(".as-faqs-1-area");
  const contact = one(".as-cta-2-area");
  const blog = one(".as-blog-1-area");

  if (about) about.id = "about";
  if (services) services.id = "services";
  if (portfolio) portfolio.id = "work";
  if (process) process.id = "process";
  if (faqs) faqs.id = "faq";
  if (contact) contact.id = "contact";

  document.querySelectorAll('a[href*="themexriver.com"]').forEach((link) => {
    link.href = "#contact";
    link.removeAttribute("target");
  });

  document.querySelectorAll(".tx-logo, .as-header-1-logo, .wa-offcanvas-top-logo").forEach((element) => {
    element.innerHTML = logo();
    element.setAttribute("aria-label", "Brand Buddyy home");
    element.href = "#top";
  });

  const nav = `
    <ul class="nav navbar-nav clearfix list-unstyled">
      <li><a href="#about">About</a></li>
      <li><a href="#services">Services</a></li>
      <li><a href="#work">Solutions</a></li>
      <li><a href="#process">Process</a></li>
      <li><a href="#faq">FAQs</a></li>
      <li><a href="#contact">Contact</a></li>
    </ul>`;
  const desktopNav = one(".as-header-1-main-navigation .menu-main-menu-container");
  const mobileNav = one(".mobile-main-navigation .menu-main-menu-container");
  if (desktopNav) desktopNav.innerHTML = nav;
  if (mobileNav) mobileNav.innerHTML = nav;

  const hero = one(".as-hero-1-area");
  if (hero) {
    hero.id = "top";
    text(".hero-disc", "Websites, software, automation and advertising — planned as one growth system.", hero);
    text(".hero-title", "Turn your digital presence into a growth engine", hero);
    text(".box-title", "Not sure what your business needs first? Let’s find the highest-impact move.", hero);
    text(".tx-button .text", "Book a free strategy call", hero);
    const heroButton = one(".tx-button", hero);
    if (heroButton) heroButton.href = "#contact";
    const address = one(".box-address", hero);
    if (address) address.innerHTML = `Prefer email? <a href="mailto:${email}">${email}</a>`;
    text(".guaranteed", "Built for outcomes, not decoration", hero);
  }
  text(".as-hero-1-copyright", "© 2026 — Brand Buddyy");

  if (about) {
    text(".tx-subTitle", "Why Brand Buddyy", about);
    text(".tx-title", "A digital partner focused on what happens after launch", about);
    text(".sec-disc", "A polished website is only useful when it supports a stronger business. We combine strategy, conversion-focused design, clean development, automation and advertising so every part of your digital operation moves customers towards action.", about);
    text(".as-rating-1 .text", "One joined-up team", about);
    text(".as-about-1-testimonial .disc", "Strategy, creative, technology and growth support without managing multiple suppliers.", about);
    text(".middle-title", "How we work", about);
    texts(".as-about-1-features-single .item-title a", [
      "Commercial clarity",
      "Direct collaboration",
      "Scalable thinking"
    ], about);
    texts(".as-about-1-features-single .item-disc", [
      "Every decision connects to a business goal, customer need or measurable next action.",
      "You work closely with the people doing the work, with clear milestones and honest advice.",
      "We build foundations that can evolve as your offers, team and customer base grow."
    ], about);
    text(".right-title", "Business-first delivery", about);
  }

  if (team) {
    text(".tx-subTitle", "What we bring", team);
    text(".tx-title", "Specialists across every stage of digital growth", team);
    texts(".as-team-1-member .name", [
      "Strategy & Positioning",
      "UX & Visual Design",
      "Development & Automation",
      "Advertising & Growth"
    ], team);
    texts(".as-team-1-member .dg", [
      "Clear offers and customer journeys",
      "Distinctive, conversion-led experiences",
      "Reliable systems built around your workflow",
      "Campaigns designed around profitable demand"
    ], team);
  }

  if (features) {
    text(".tx-subTitle", "Why choose us", features);
    text(".tx-title", "Less digital noise. More useful business progress.", features);
    texts(".title", [
      "Ideas grounded in strategy",
      "Quality without unnecessary complexity",
      "A complete growth perspective"
    ], features);
    texts(".disc", [
      "Creative thinking starts with your market, offer and customer — not with trends.",
      "Clean design, dependable code and practical systems your team can actually use.",
      "We consider acquisition, conversion and operations together instead of treating them as separate problems."
    ], features);
    text(".rating-number", "One");
    text(".rating-disc", "Accountable partner");
    text(".rating-author-disc", "One team responsible for the complete digital journey.");
  }

  if (partners) {
    text(".tx-subTitle", "Connected growth", partners);
    text(".tx-title", "Your brand, systems and marketing should strengthen each other", partners);
    text(".as-partner-1-boost .title", "Build Your");
    const boostTitles = all(".as-partner-1-boost .title");
    if (boostTitles[1]) boostTitles[1].textContent = "Growth System";
  }

  if (services) {
    text(".tx-subTitle", "Services", services);
    text(".tx-title", "The capabilities required to attract, convert and scale", services);
    text(".tx-description", "Choose a focused project or combine services into a complete growth system built around your priorities.", services);
    const cards = all(".as-services-1-item", services);
    const serviceData = [
      {
        title: "Websites & Landing Pages",
        tags: ["Strategy & UX", "Responsive Design", "Conversion Copy", "Development"]
      },
      {
        title: "Web Apps & Custom Software",
        tags: ["Customer Portals", "Internal Tools", "Dashboards", "Integrations"]
      },
      {
        title: "Automation & Business Systems",
        tags: ["Workflow Mapping", "CRM Automation", "Lead Routing", "Reporting"]
      },
      {
        title: "Paid Ads & Brand Growth",
        tags: ["Campaign Strategy", "Creative Direction", "Lead Generation", "Optimisation"]
      }
    ];
    cards.forEach((card, index) => {
      const data = serviceData[index];
      if (!data) return;
      texts(".title a", [data.title, data.title], card);
      texts(".item-tags li", data.tags, card);
    });
    text(".as-pr-btn-1 .text", "Discuss your goals", services);
  }

  if (portfolio) {
    text(".tx-subTitle", "Solutions", portfolio);
    text(".tx-title", "Built around the business problem, not a predefined package", portfolio);
    text(".big-title", "What we can build", portfolio);
    const items = all(".as-portfolio-1-item", portfolio);
    const showcase = [
      ["Lead Generation Website", "Positioning, UX, copy and development designed to turn interest into qualified enquiries.", ["Website", "Conversion"]],
      ["Customer Web Platform", "A secure, intuitive digital product that gives customers a better way to interact with your business.", ["Web App", "Software"]],
      ["Automated Sales Workflow", "Connected forms, CRM, follow-up and reporting that keep leads moving without manual chasing.", ["Automation", "Operations"]],
      ["Performance Campaign System", "Paid media, creative and landing pages built as one measurable acquisition journey.", ["Advertising", "Growth"]]
    ];
    items.forEach((item, index) => {
      const data = showcase[index];
      if (!data) return;
      text(".content-wrap .title a", data[0], item);
      text(".content-wrap .disc", data[1], item);
      texts(".item-tags a", data[2], item);
    });
    text(".as-portfolio-1-counter", "4 connected capabilities", portfolio);
    text(".as-portfolio-1-content-disc", "No invented case-study numbers. These are the practical growth systems we can tailor to your business.", portfolio);
  }

  if (testimonial) {
    text(".tx-subTitle", "What matters", testimonial);
    text(".tx-title", "The standards clients should expect from a digital partner", testimonial);
    const cards = all(".as-testimonial-1-item", testimonial);
    const expectations = [
      ["Clear commercial thinking", "You should understand why each recommendation matters, what it supports and how success will be assessed."],
      ["Communication without chasing", "You should always know what is happening, what comes next and where decisions are required."],
      ["Work built to be used", "Your team should be able to manage, operate and extend what we create without unnecessary dependence."],
      ["Continuous improvement", "Launch is the beginning of real learning. We use behaviour and performance to guide the next improvement."]
    ];
    cards.forEach((card, index) => {
      if (!expectations[index]) return;
      text(".title", expectations[index][0], card);
      text(".comment", expectations[index][1], card);
      text(".name", "Brand Buddyy principle", card);
      text(".dg", ["Strategy", "Collaboration", "Delivery", "Growth"][index], card);
      all(".author-logo, .item-author-img", card).forEach((el) => el.classList.add("bb-conceal"));
    });
    all("iframe", testimonial).forEach((frame) => {
      frame.removeAttribute("src");
      frame.closest(".as-testimonial-1-video")?.classList.add("bb-video-message");
    });
  }

  if (pricing) {
    text(".tx-subTitle", "Ways to work together", pricing);
    text(".tx-title", "An engagement shaped around the outcome you need", pricing);
    text(".sec-disc", "Every scope is priced after we understand the goal, complexity and commercial priority. No inflated bundles and no paying for work you do not need.", pricing);
    const cards = all(".as-price-1-card", pricing);
    const models = [
      {
        name: "Focused Build",
        description: "For a clearly defined website, landing page, automation or product requirement.",
        price: "Fixed scope",
        list: ["Discovery and recommendations", "Clear deliverables and milestones", "Design and development", "Testing and launch support", "Handover and documentation", "Optional ongoing optimisation"]
      },
      {
        name: "Growth System",
        description: "For businesses connecting their website, lead generation, advertising and operations.",
        price: "Phased project",
        list: ["Commercial and customer journey audit", "Website or funnel build", "CRM and workflow automation", "Campaign and creative direction", "Measurement foundations", "Prioritised improvement roadmap"]
      },
      {
        name: "Ongoing Partner",
        description: "For teams that need consistent technical, creative and growth support.",
        price: "Monthly support",
        list: ["Planned monthly priorities", "Website and software improvements", "Automation maintenance", "Landing pages and campaign creative", "Performance reviews", "Flexible specialist support"]
      }
    ];
    cards.forEach((card, index) => {
      const model = models[index];
      if (!model) return;
      text(".plan-name", model.name, card);
      text(".plan-disc", model.description, card);
      text(".plan-price", model.price, card);
      texts(".plan-list li", model.list, card);
      text(".plan-btn .text", "Request a tailored scope", card);
      one(".plan-btn", card)?.setAttribute("href", "#contact");
    });
  }

  if (process) {
    text(".as-process-1-sec-title .tx-title", "A clear route from business challenge to working solution", process);
    const cards = all(".as-process-1-card", process);
    const stages = [
      ["Discover & Prioritise", "We clarify your goals, customer journey, constraints and highest-value opportunity."],
      ["Design & Build", "We turn the plan into a focused experience, system or campaign with regular review points."],
      ["Launch & Improve", "We test, release and use real performance data to decide what should improve next."]
    ];
    cards.forEach((card, index) => {
      if (!stages[index]) return;
      text(".title", stages[index][0], card);
      text(".disc", stages[index][1], card);
    });
    text(".as-process-1-big-title", "Process", process);
  }

  if (faqs) {
    text(".as-faqs-1-left-sec-title .tx-title", "What you can expect from us", faqs);
    texts(".as-faqs-1-awards-single", [
      "Clear scope before work begins",
      "Direct access to the delivery team",
      "Honest recommendations based on priority"
    ], faqs);
    text(".as-faqs-1-right-sec-title .tx-title", "Questions clients ask before starting", faqs);
    const questions = [
      ["What type of businesses do you work with?", "We work best with ambitious service businesses, startups and growing teams that need stronger digital foundations, better lead generation or more efficient operations."],
      ["Can you help us decide what to build first?", "Yes. We start by identifying the bottleneck with the greatest commercial impact. You may need a landing page before a full website, or workflow automation before more advertising."],
      ["How long does a typical project take?", "A focused landing page may take a few weeks, while a larger website, platform or automation system takes longer. You receive a realistic timeline after discovery and before committing."],
      ["Do you provide support after launch?", "Yes. We can provide ongoing optimisation, technical support, campaign creative and automation maintenance according to what the project needs."],
      ["How is a project priced?", "Pricing is based on scope, complexity and the outcome required. After an initial conversation, we provide a clear proposal with deliverables, milestones and costs."],
      ["What do you need from us to begin?", "A clear view of your business goals, current challenges, customers and internal decision-makers. We guide the rest through a structured discovery process."]
    ];
    const accordionItems = all(".as-accordion-item", faqs);
    accordionItems.forEach((item, index) => {
      const content = questions[index % questions.length];
      if (!content) return;
      const button = one(".item-title", item);
      if (button) {
        const number = String((index % questions.length) + 1).padStart(2, "0");
        const icon = one(".icon", button);
        button.innerHTML = `<span class="text">${number}.</span>${content[0]}${icon ? icon.outerHTML : ""}`;
      }
      const answer = one(".item-disc", item);
      if (answer) answer.textContent = content[1];
    });
  }

  if (contact) {
    text(".as-cta-2-booking .title", "Ready to solve the next digital bottleneck?", contact);
    text(".as-cta-2-booking .disc", "Book a free, practical conversation about your goals and the clearest next step.", contact);
    text(".as-cta-2-booking .as-pr-btn-1-v2 .text", "Book a free strategy call", contact);
    const mail = one(".as-cta-2-booking .mail", contact);
    if (mail) mail.innerHTML = `<p>or email us at <a href="mailto:${email}">${email}</a></p>`;
    text(".as-cta-2-manager .text-elm", "Speak directly with the Brand Buddyy team", contact);
    text(".as-cta-2-projects .title", "Build something your business can grow with", contact);
    text(".as-cta-2-form-content .subtitle", "We aim to reply within one working day", contact);
    text(".as-cta-2-form-content .title", "Tell us what you want to improve", contact);
    text(".author-name", "Brand Buddyy", contact);
    text(".author-dg", "Strategy & delivery team", contact);
    text(".checkbox-label", "Send me occasional useful growth insights", contact);
    text("button[type='submit'] .text", "Email project details", contact);

    const budgetSelect = one('select[name="select-715"]', contact);
    if (budgetSelect) budgetSelect.innerHTML = `
      <option value="">Indicative investment</option>
      <option value="Under £2,500">Under £2,500</option>
      <option value="£2,500–£5,000">£2,500–£5,000</option>
      <option value="£5,000–£10,000">£5,000–£10,000</option>
      <option value="£10,000+">£10,000+</option>`;
    const serviceSelect = one('select[name="select-716"]', contact);
    if (serviceSelect) serviceSelect.innerHTML = `
      <option value="">What do you need help with?</option>
      <option>Website or landing page</option>
      <option>Web app or custom software</option>
      <option>Business automation</option>
      <option>Paid ads and lead generation</option>
      <option>Brand and growth strategy</option>
      <option>Not sure yet</option>`;

    const refreshVisibleSelect = (select) => {
      if (!select) return;
      const wrapper = select.parentElement?.querySelector(".nice-select");
      if (!wrapper) return;
      const options = [...select.options];
      const current = one(".current", wrapper);
      const list = one(".list", wrapper);
      if (current) current.textContent = options[0]?.textContent || "";
      if (list) {
        list.innerHTML = options.map((option, index) =>
          `<li data-value="${option.value}" class="option${index === 0 ? " selected" : ""}">${option.textContent}</li>`
        ).join("");
      }
    };
    refreshVisibleSelect(budgetSelect);
    refreshVisibleSelect(serviceSelect);

    const form = one("form", contact);
    if (form) {
      form.action = "#contact";
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        const name = one('input[name="text-60"]', form)?.value.trim() || "New prospect";
        const from = one('input[name="email-60"]', form)?.value.trim() || "Not provided";
        const budget = budgetSelect?.value || "Not specified";
        const need = serviceSelect?.value || "Not specified";
        const message = one('textarea[name="textarea-60"]', form)?.value.trim() || "No additional details";
        const subject = encodeURIComponent(`New project enquiry from ${name}`);
        const body = encodeURIComponent(`Name: ${name}\nEmail: ${from}\nInvestment: ${budget}\nService: ${need}\n\nProject details:\n${message}`);
        window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
      }, true);
    }
  }

  if (blog) {
    text(".tx-subTitle", "Useful thinking", blog);
    text(".tx-title", "Practical ideas for stronger digital growth decisions", blog);
    text(".tx-description", "Clear guidance for businesses planning their next website, system or campaign.", blog);
    const posts = all(".as-blog-1-item", blog);
    const postData = [
      ["Conversion Strategy", "Why a better-looking website may not fix your lead problem", "Before redesigning, identify where trust, clarity or the customer journey is actually breaking down."],
      ["Business Automation", "What should you automate first in a growing business?", "Start with repetitive, high-frequency work where delays or manual errors directly affect customers and revenue."]
    ];
    posts.forEach((post, index) => {
      if (!postData[index]) return;
      text(".categories a", postData[index][0], post);
      text(".title a", postData[index][1], post);
      text(".disc", postData[index][2], post);
      text(".btn-wrap .text", "Discuss this challenge", post);
      all("a", post).forEach((link) => link.href = "#contact");
    });
  }

  document.querySelectorAll("a, button").forEach((element) => {
    const current = element.textContent.replace(/\s+/g, " ").trim().toLowerCase();
    if (["get started", "get started today", "schedule a call", "book an appointment"].includes(current)) {
      const label = current.includes("call") || current.includes("appointment") ? "Book a free strategy call" : "Start your project";
      const textNode = one(".text", element);
      if (textNode) textNode.textContent = label;
      else element.textContent = label;
      if (element.tagName === "A") element.href = "#contact";
    }
  });

  document.querySelectorAll('a[href^="mailto:"]').forEach((link) => {
    link.href = `mailto:${email}`;
    if (link.textContent.includes("@")) link.textContent = email;
  });
  text(".as-footer-1-big-email", email);
  const footerEmail = one(".as-footer-1-big-email");
  if (footerEmail) footerEmail.href = `mailto:${email}`;
  text(".as-footer-1-newsletter .tx-description", "Occasional practical insights on websites, automation, advertising and digital growth.");
  text(".as-footer-1-copyright", "© Brand Buddyy 2026. All rights reserved.");
})();
