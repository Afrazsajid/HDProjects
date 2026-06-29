const header=document.querySelector('.site-header');
const menuButton=document.querySelector('.menu-button');
const mobileMenu=document.querySelector('.mobile-menu');
menuButton.addEventListener('click',()=>{
  const open=menuButton.getAttribute('aria-expanded')==='true';
  menuButton.setAttribute('aria-expanded',String(!open));
  menuButton.setAttribute('aria-label',open?'Open menu':'Close menu');
  mobileMenu.classList.toggle('open',!open);
  mobileMenu.setAttribute('aria-hidden',String(open));
  header.classList.toggle('menu-open',!open);
});
mobileMenu.querySelectorAll('a').forEach(link=>link.addEventListener('click',()=>{
  menuButton.setAttribute('aria-expanded','false');
  mobileMenu.classList.remove('open');
  mobileMenu.setAttribute('aria-hidden','true');
  header.classList.remove('menu-open');
}));
const observer=new IntersectionObserver(entries=>{
  entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('visible');observer.unobserve(entry.target)}});
},{threshold:.12});
document.querySelectorAll('.reveal').forEach(el=>observer.observe(el));
document.getElementById('year').textContent=new Date().getFullYear();
