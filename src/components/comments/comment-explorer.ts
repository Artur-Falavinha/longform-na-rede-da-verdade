import type { Dispose } from "../../data/types";

export function initCommentExplorer(root: HTMLElement): Dispose {
  const tabs = [
    ...root.querySelectorAll<HTMLAnchorElement>("[data-group-select]"),
  ];
  const panels = [
    ...root.querySelectorAll<HTMLElement>("[data-comment-group]"),
  ];
  const controller = new AbortController();
  root.querySelector("[data-tab-list]")!.setAttribute("role", "tablist");
  function select(index: number, userInitiated: boolean) {
    tabs.forEach((tab, i) => {
      tab.setAttribute("aria-selected", String(i === index));
      tab.tabIndex = i === index ? 0 : -1;
      panels[i].hidden = i !== index;
    });
    if (userInitiated)
      root.dispatchEvent(
        new CustomEvent("longform:comment-open", {
          bubbles: true,
          detail: {
            groupId: tabs[index].dataset.groupSelect,
            userInitiated: true,
          },
        }),
      );
  }
  tabs.forEach((tab, index) => {
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-controls", panels[index].id);
    panels[index].setAttribute("role", "tabpanel");
    panels[index].setAttribute("aria-labelledby", tab.id);
    tab.addEventListener(
      "click",
      (event) => {
        event.preventDefault();
        select(index, true);
      },
      { signal: controller.signal },
    );
    tab.addEventListener(
      "keydown",
      (event) => {
        let next = index;
        if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
        else if (event.key === "ArrowLeft")
          next = (index + tabs.length - 1) % tabs.length;
        else if (event.key === "Home") next = 0;
        else if (event.key === "End") next = tabs.length - 1;
        else if (event.key === " ") {
          event.preventDefault();
          select(index, true);
          return;
        } else return;
        event.preventDefault();
        tabs[next].focus();
        select(next, true);
      },
      { signal: controller.signal },
    );
  });
  select(0, false);
  return () => {
    controller.abort();
    panels.forEach((panel) => {
      panel.hidden = false;
      panel.removeAttribute("role");
    });
  };
}
