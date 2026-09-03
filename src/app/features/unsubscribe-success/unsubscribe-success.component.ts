import { Component } from '@angular/core';
import { environment } from '../../../environments/environment';
import { CommonModule } from '@angular/common';

@Component( {
  selector: 'app-unsubscribe-success',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './unsubscribe-success.component.html',
  styleUrl: './unsubscribe-success.component.css'
} )
export class UnsubscribeSuccessComponent {

  statMessage: string;
  readonly COMPANY_NAME = environment.COMPANY_NAME;

  // List of TODD stats to display randomly
  private toddStats: string[] = [
    "TODD helps you stay ahead by identifying potential opportunities before your competitors do.",
    "With TODD, you can automate routine tasks, freeing up time to focus on strategic decisions.",
    "TODD's AI-driven insights ensure you're always prepared for important meetings and follow-ups.",
    "Never miss a critical task or deadline again—TODD proactively manages your priorities.",
    "TODD provides actionable recommendations, helping you make smarter business decisions faster."
  ];

  constructor () {
    // Select a random stat from the list
    this.statMessage = this.getRandomStat();
  }
  // Method to get a random stat
  private getRandomStat (): string {
    const randomIndex = Math.floor( Math.random() * this.toddStats.length );
    return this.toddStats[randomIndex];
  }

}
