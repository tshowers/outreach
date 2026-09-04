import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';

export const EmailStages = [
  { emailType: "First Touch", stage: "first_touch", number: 1, explanation: "Initial outreach to introduce the conversation." },
  { emailType: "Follow Up 1", stage: "follow_up_1", number: 2, explanation: "First follow-up to maintain momentum." },
  { emailType: "Follow Up 2", stage: "follow_up_2", number: 3, explanation: "Second follow-up to reinforce interest." },
  { emailType: "Engaged", stage: "engaged", number: 4, explanation: "Signals show strong interest or interaction." },
  { emailType: "Meeting Push", stage: "meeting_push", number: 5, explanation: "Drive toward scheduling a meeting or next step." },
  { emailType: "Breakup", stage: "breakup", number: 6, explanation: "Final attempt before closing the loop." },
  { emailType: "Won", stage: "won", number: 7, explanation: "Conversation successfully converted." },
  { emailType: "Lost", stage: "lost", number: 8, explanation: "Conversation closed without conversion." }
];

@Component( {
  selector: 'app-email-stage-progress',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './email-stage-progress.component.html',
  styleUrl: './email-stage-progress.component.css'
} )
export class EmailStageProgressComponent implements OnInit {
  @Input() currentStage!: string;


  emailStages = EmailStages;

  currentStageIndex: number = 0;

  ngOnInit () {
    const index = this.emailStages.findIndex( stage => stage.stage === this.currentStage );
    if ( index !== -1 ) {
      this.currentStageIndex = index;
    } else {
      console.warn( "Invalid email stage provided:", this.currentStage );
    }
  }

}
