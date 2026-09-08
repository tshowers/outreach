import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-theme-toggle',
  standalone: true,
  template: `<button class="theme-toggle" type="button" (click)="toggle()" [attr.aria-label]="isDark ? 'Switch to light mode' : 'Switch to dark mode'" [attr.title]="isDark ? 'Light mode' : 'Dark mode'"><span aria-hidden="true">{{ isDark ? '☼' : '☾' }}</span><span>{{ isDark ? 'Light' : 'Dark' }}</span></button>`,
  styleUrl: './theme-toggle.component.css'
})
export class ThemeToggleComponent implements OnInit {
  isDark = false;
  ngOnInit(): void { const saved = localStorage.getItem('outreach-theme'); this.isDark = saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches; document.documentElement.classList.toggle('dark', this.isDark); }
  toggle(): void { this.isDark = !this.isDark; document.documentElement.classList.toggle('dark', this.isDark); localStorage.setItem('outreach-theme', this.isDark ? 'dark' : 'light'); }
}
