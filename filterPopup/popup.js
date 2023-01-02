async function load() {
  let tabs = await messenger.tabs.query({active: true, currentWindow: true});



  let matchingFilters = await messenger.runtime.sendMessage({
    command: "getMatchingFilters",
    tabId: tabs[0].id
  });

  let filterWrapper = document.getElementById('filterSelection');
  for (let filter of matchingFilters) {
    const filterEl = document.createElement("li");
    filterEl.innerText = filter.filterName;

    ((filterId) => {
      filterEl.onclick = () => {
        messenger.runtime.sendMessage({
          command: "executeFilterActions",
          filterId: filterId,
          tabId: tabs[0].id
        });
        window.close();
      };
    })(filter.filterId);

    filterWrapper.appendChild(filterEl);
  }
}

document.addEventListener("DOMContentLoaded", load);

