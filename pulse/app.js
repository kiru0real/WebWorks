/* PULSE interactions: progressive enhancement, no external dependencies. */
(() => {
  "use strict";
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));
  // Scroll reveal: observe only meaningful blocks, with a graceful fallback.
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!reduceMotion) {
    const revealTargets = [
      ".section-heading", ".feature", ".solutions-copy", ".solution-stage",
      ".story-card", ".price-card", ".faq-item", ".contact-grid > *",
      ".cta-panel", ".numbers > *", ".trust-logos", ".events-visual",
      ".events-head", ".footer-main > *"
    ].flatMap(selector => $$(selector));
    const uniqueTargets = [...new Set(revealTargets)].filter(el => !el.closest(".hero"));
    uniqueTargets.forEach((el, index) => {
      el.classList.add("reveal-on-scroll");
      if (index % 3 === 1) el.classList.add("reveal-from-left");
      if (index % 3 === 2) el.classList.add("reveal-from-right");
      el.style.setProperty("--reveal-delay", `${(index % 4) * 75}ms`);
    });
    if ("IntersectionObserver" in window) {
      document.documentElement.classList.add("js-reveal-ready");
      const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      }, { threshold: 0.12, rootMargin: "0px 0px -40px 0px" });
      uniqueTargets.forEach(el => observer.observe(el));
    } else {
      uniqueTargets.forEach(el => el.classList.add("is-visible"));
    }
  }

  const year = $("#currentYear");
  if (year) year.textContent = String(new Date().getFullYear());

  // Mobile menu.
  const toggle = $("#menuToggle");
  const mobileNav = $("#mobileNav");
  if (toggle && mobileNav) {
    toggle.addEventListener("click", () => {
      const open = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", String(!open));
      toggle.setAttribute("aria-label", open ? "Открыть меню" : "Закрыть меню");
      mobileNav.hidden = open;
    });
    $$('a', mobileNav).forEach(a => a.addEventListener("click", () => {
      mobileNav.hidden = true;
      toggle.setAttribute("aria-expanded", "false");
      toggle.setAttribute("aria-label", "Открыть меню");
    }));
    document.addEventListener("keydown", e => {
      if (e.key === "Escape" && !mobileNav.hidden) {
        mobileNav.hidden = true;
        toggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  // Dashboard period switch: sample chart, fully local SVG path updates.
  const chartSets = {
    "30": { revenue:"₽8,42 млн", line:"M0 133 C20 130 23 111 42 117 S67 96 86 103 S112 70 132 84 S160 92 180 60 S210 66 226 53 S255 67 274 42 S305 38 323 47 S350 25 370 29 S405 19 440 8", labels:["01 окт","07 окт","14 окт","21 окт","30 окт"] },
    "7": { revenue:"₽2,16 млн", line:"M0 120 C22 127 28 93 53 104 S83 76 105 88 S134 59 159 73 S186 40 213 52 S240 66 267 39 S294 45 321 29 S362 44 385 19 S416 18 440 7", labels:["20 окт","22 окт","24 окт","26 окт","30 окт"] },
    "90": { revenue:"₽24,7 млн", line:"M0 142 C21 136 30 143 49 124 S80 135 99 105 S127 113 148 97 S181 106 203 79 S234 88 253 60 S285 73 306 48 S342 60 360 32 S403 28 440 6", labels:["01 авг","15 авг","01 сен","15 сен","30 окт"] }
  };
  const periods = $$(".period");
  const chartLine = $("#chartLine");
  const chartFill = $("#chartFill");
  const chartRevenue = $("#chartRevenue");
  const chartLabels = $$(".x-axis span");
  periods.forEach(btn => btn.addEventListener("click", () => {
    const data = chartSets[btn.dataset.period];
    if (!data) return;
    periods.forEach(b => { const active = b === btn; b.classList.toggle("active", active); b.setAttribute("aria-pressed", String(active)); });
    if (chartLine) chartLine.setAttribute("d", data.line);
    if (chartFill) chartFill.setAttribute("d", `${data.line} V150 H0Z`);
    if (chartRevenue) chartRevenue.textContent = data.revenue;
    chartLabels.forEach((el, i) => { el.textContent = data.labels[i]; });
  }));

  // Role tabs.
  const solutions = {
    growth: { label:"Стоимость привлечения", kpi:"₽640", target:"₽700", width:"82%", title:"Канал показывает потенциал", insight:"Поиск даёт на 22% больше конверсий при меньшей стоимости.", bars:[34,52,43,67,58,75,64,88,78,96,82,100] },
    product: { label:"Удержание пользователей", kpi:"68,4%", target:"65%", width:"91%", title:"Новые пользователи остаются", insight:"Активация ключевого сценария выросла на 16% за период.", bars:[45,39,55,47,61,58,76,68,81,73,91,100] },
    finance: { label:"Операционная маржа", kpi:"24,8%", target:"22%", width:"96%", title:"Эффективность растёт", insight:"Расходы на процессы снизились, маржа выше целевого уровня.", bars:[29,44,38,56,52,65,62,71,85,80,92,100] }
  };
  const tabs = $$(".solution-tab");
  const panel = $("#solutionPanel");
  tabs.forEach((tab, index) => {
    tab.tabIndex = index === 0 ? 0 : -1;
    tab.addEventListener("click", () => {
      const data = solutions[tab.dataset.solution];
      if (!data) return;
      tabs.forEach(t => { const active = t === tab; t.classList.toggle("active", active); t.setAttribute("aria-selected", String(active)); t.tabIndex = active ? 0 : -1; });
      if (panel) panel.setAttribute("aria-labelledby", tab.id);
      $("#solutionKpiLabel").textContent = data.label;
      $("#solutionKpi").textContent = data.kpi;
      $("#solutionTarget").textContent = data.target;
      $("#solutionTrack").style.width = data.width;
      $("#solutionInsightTitle").textContent = data.title;
      $("#solutionInsight").textContent = data.insight;
      $$("#solutionBars i").forEach((bar, i) => { bar.style.height = `${data.bars[i]}%`; });
    });
    tab.addEventListener("keydown", e => {
      if (!["ArrowDown","ArrowUp","ArrowRight","ArrowLeft"].includes(e.key)) return;
      e.preventDefault();
      const next = (tabs.indexOf(tab) + ( ["ArrowDown","ArrowRight"].includes(e.key) ? 1 : -1) + tabs.length) % tabs.length;
      tabs[next].focus(); tabs[next].click();
    });
  });

  // Pricing toggle.
  const billingToggle = $("#billingToggle");
  const monthlyLabel = $("#monthlyLabel");
  const yearlyLabel = $("#yearlyLabel");
  const growthNote = $("#growthPriceNote");
  const prices = $$("[data-monthly][data-yearly]");
  function setYearly(yearly) {
    billingToggle.setAttribute("aria-checked", String(yearly));
    monthlyLabel.classList.toggle("active", !yearly);
    yearlyLabel.classList.toggle("active", yearly);
    prices.forEach(el => { el.textContent = yearly ? el.dataset.yearly : el.dataset.monthly; });
    if (growthNote) growthNote.textContent = yearly ? "При оплате за год · −20%" : "Оплата ежемесячно";
  }
  billingToggle?.addEventListener("click", () => setYearly(billingToggle.getAttribute("aria-checked") !== "true"));

  // Accessible FAQ accordion.
  $$(".faq-question").forEach(btn => btn.addEventListener("click", () => {
    const expanded = btn.getAttribute("aria-expanded") === "true";
    btn.setAttribute("aria-expanded", String(!expanded));
    const answer = btn.nextElementSibling;
    if (answer) answer.hidden = expanded;
    btn.closest(".faq-item")?.classList.toggle("open", !expanded);
  }));

  // Testimonial carousel.
  const stories = [
    { quote:"Раньше понедельник начинался с трёх часов в таблицах. Теперь команда приходит на встречу уже с ответами — и обсуждает, что делать дальше.", name:"Алина К.", role:"Head of Growth, northstar", initials:"АК" },
    { quote:"Самое ценное — видеть одни и те же данные всей командой. Спорить о решениях стало проще, потому что цифры у нас перед глазами.", name:"Марк В.", role:"Founder, studio arc", initials:"МВ" },
    { quote:"Мы перестали искать проблему в пяти разных отчётах. Теперь замечаем отклонения быстрее и тратим время на действия, а не на сбор информации.", name:"Саша Р.", role:"Operations Lead, quarter", initials:"СР" }
  ];
  let storyIndex = 0;
  const dots = $$("#storyDots i");
  function showStory(index) {
    storyIndex = (index + stories.length) % stories.length;
    const story = stories[storyIndex];
    $("#storyQuote").textContent = story.quote;
    $("#storyName").textContent = story.name;
    $("#storyRole").textContent = story.role;
    $("#storyAvatar").textContent = story.initials;
    $("#storyCount").innerHTML = `0${storyIndex + 1} <i>/</i> 0${stories.length}`;
    dots.forEach((dot, i) => dot.classList.toggle("active", i === storyIndex));
  }
  $("#storyPrev")?.addEventListener("click", () => showStory(storyIndex - 1));
  $("#storyNext")?.addEventListener("click", () => showStory(storyIndex + 1));

  // Pricing CTA preselects the matching option in the contact form.
  $$('[data-plan]').forEach(link => link.addEventListener("click", () => {
    const planSelect = $("#leadPlan");
    if (planSelect && Array.from(planSelect.options).some(option => option.value === link.dataset.plan)) {
      planSelect.value = link.dataset.plan;
    }
  }));

  // Local-only demo form: intentionally does not transmit or persist personal data.
  const form = $("#leadForm");
  const status = $("#formStatus");
  const toast = $("#toast");
  let toastTimer;
  function showToast(message) {
    if (!toast) return;
    toast.textContent = message; toast.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove("show"), 3500);
  }
  form?.addEventListener("submit", e => {
    e.preventDefault();
    const nameInput = $("#leadName");
    nameInput.setCustomValidity("");
    if (!form.reportValidity()) return;
    const name = nameInput.value.trim();
    const plan = $("#leadPlan").value;
    if (name.length < 2) { nameInput.setCustomValidity("Введите имя длиной не менее двух символов."); nameInput.reportValidity(); return; }
    status.textContent = `Спасибо, ${name}! Демозаявка на тариф ${plan} обработана локально. Данные никуда не отправлялись.`;
    showToast("Готово — демозаявка обработана в браузере.");
    form.reset();
  });
})();
