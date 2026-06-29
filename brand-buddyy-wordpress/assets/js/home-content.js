(function () {
	"use strict";

	const data = window.brandBuddyyTheme || {};

	const toList = (value) => {
		if (Array.isArray(value)) {
			return value.map((item) => {
				if (typeof item === "string") return item;
				if (item && typeof item === "object") {
					return item.text || item.title || item.feature || item.tag || "";
				}
				return "";
			}).filter(Boolean);
		}

		return String(value || "")
			.split(/\r?\n|,\s*/)
			.map((item) => item.trim())
			.filter(Boolean);
	};

	const setValue = (element, type, value, index) => {
		if (!element || value === undefined || value === null || value === "") return;

		switch (type) {
			case "html":
				element.innerHTML = value;
				break;
			case "href":
				element.setAttribute("href", value);
				break;
			case "src":
				element.setAttribute("src", value);
				element.removeAttribute("srcset");
				break;
			case "faqTitle": {
				const icon = element.querySelector(".icon");
				const number = String((index || 0) + 1).padStart(2, "0");
				element.innerHTML = `<span class="text">${number}.</span>${value}${icon ? icon.outerHTML : ""}`;
				break;
			}
			default:
				element.textContent = value;
				element.classList.add("bb-replaced-title");
		}
	};

	const applyOperation = (operation) => {
		if (!operation || !operation.selector) return;

		let elements;
		try {
			elements = [...document.querySelectorAll(operation.selector)];
		} catch (error) {
			return;
		}

		if (operation.type === "textAll" || operation.type === "hrefAll") {
			const type = operation.type === "textAll" ? "text" : "href";
			elements.forEach((element) => setValue(element, type, operation.value));
			return;
		}

		if (operation.type === "ctaTitle") {
			const root = elements[0];
			if (!root) return;
			const lines = String(operation.value).split(/\r?\n|\|/).map((line) => line.trim()).filter(Boolean);
			setValue(root.querySelector(".title-1"), "text", lines[0] || operation.value);
			if (lines[1]) setValue(root.querySelector(".title-2"), "text", lines[1]);
			return;
		}

		setValue(elements[0], operation.type, operation.value);
	};

	const applyRepeater = (definition) => {
		const root = document.querySelector(definition.root);
		if (!root || !Array.isArray(definition.rows)) return;

		let items;
		try {
			items = [...root.querySelectorAll(definition.item)];
		} catch (error) {
			return;
		}

		definition.rows.forEach((row, index) => {
			const item = items[index];
			if (!item || !row) return;

			Object.entries(definition.fields || {}).forEach(([fieldName, settings]) => {
				const value = row[fieldName];
				if (value === undefined || value === null || value === "") return;

				const [selector, type] = settings;
				let targets;
				try {
					targets = selector === ":scope" ? [item] : [...item.querySelectorAll(selector)];
				} catch (error) {
					return;
				}

				if (type === "textAll" || type === "hrefAll") {
					const singleType = type === "textAll" ? "text" : "href";
					targets.forEach((target) => setValue(target, singleType, value, index));
				} else if (type === "textList") {
					const values = toList(value);
					targets.forEach((target, targetIndex) => {
						if (values[targetIndex] !== undefined) {
							setValue(target, "text", values[targetIndex], targetIndex);
						}
					});
				} else {
					setValue(targets[0], type, value, index);
				}
			});
		});
	};

	const configureContactForm = () => {
		const original = document.querySelector(".as-cta-2-area form");
		if (!original || !data.ajaxUrl || !data.contactNonce) return;

		const form = original.cloneNode(true);
		original.replaceWith(form);

		form.action = data.ajaxUrl;
		form.method = "post";

		form.querySelectorAll(".nice-select").forEach((visualSelect) => {
			const select = visualSelect.previousElementSibling && visualSelect.previousElementSibling.tagName === "SELECT"
				? visualSelect.previousElementSibling
				: visualSelect.querySelector("select");
			if (select) {
				select.style.display = "block";
				select.classList.add("as-cta-2-form-selector");
			}
			visualSelect.remove();
		});

		const hiddenValues = {
			action: "brand_buddyy_contact",
			brand_buddyy_contact_nonce: data.contactNonce,
		};

		Object.entries(hiddenValues).forEach(([name, value]) => {
			let input = form.querySelector(`input[name="${name}"]`);
			if (!input) {
				input = document.createElement("input");
				input.type = "hidden";
				input.name = name;
				form.appendChild(input);
			}
			input.value = value;
		});
	};

	const run = () => {
		(data.operations || []).forEach(applyOperation);
		(data.repeaters || []).forEach(applyRepeater);
		configureContactForm();
	};

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", run, { once: true });
	} else {
		run();
	}
})();
