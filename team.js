const mount = document.querySelector("#team-list");

function note(message) {
  const paragraph = document.createElement("p");
  paragraph.className = "team-note";
  paragraph.textContent = message;
  mount.replaceChildren(paragraph);
}

function photoSrc(path) {
  const value = String(path || "").trim();
  if (!value || value.includes("..") || value.includes("\\") || /^[a-z][a-z0-9+.-]*:/i.test(value)) {
    return "";
  }
  return value.startsWith("/") ? value : `/${value}`;
}

function render(people) {
  if (!Array.isArray(people)) {
    note("The team list could not be loaded.");
    return;
  }

  const list = document.createElement("ul");
  list.className = "team-list";

  for (const person of people) {
    if (!person || typeof person !== "object") continue;
    const name = String(person.name || "").trim();
    const title = String(person.title || "").trim();
    const bio = String(person.bio || "").trim();
    const src = photoSrc(person.photo);
    if (!name && !title && !bio && !src) continue;

    const item = document.createElement("li");
    item.className = "person";

    if (src) {
      const image = document.createElement("img");
      image.src = src;
      image.alt = name;
      item.append(image);
    }

    const copy = document.createElement("div");
    copy.className = "person-copy";

    if (name) {
      const heading = document.createElement("h3");
      heading.textContent = name;
      copy.append(heading);
    }
    if (title) {
      const role = document.createElement("p");
      role.className = "role";
      role.textContent = title;
      copy.append(role);
    }
    if (bio) {
      const paragraph = document.createElement("p");
      paragraph.textContent = bio;
      copy.append(paragraph);
    }

    item.append(copy);
    list.append(item);
  }

  if (!list.childElementCount) {
    note("No team profiles are listed yet.");
    return;
  }

  mount.replaceChildren(list);
}

if (mount) {
  fetch("/data/team.json")
    .then((response) => {
      if (!response.ok) throw new Error("missing");
      return response.json();
    })
    .then(render)
    .catch(() => note("The team list could not be loaded."));
}
