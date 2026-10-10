/* Native details menus still work without JavaScript. Enhance dismissal only. */
document.querySelectorAll('[data-brand-menu]').forEach(menu => {
  const trigger = menu.querySelector('summary');
  menu.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menu.open) {
      menu.open = false;
      trigger.focus();
    }
  });
  document.addEventListener('click', event => {
    if (menu.open && !menu.contains(event.target)) menu.open = false;
  });
  menu.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
    menu.open = false;
  }));
});
