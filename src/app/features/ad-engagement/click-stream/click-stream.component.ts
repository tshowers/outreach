import { Component, OnInit, OnDestroy } from '@angular/core';
import { OutreachApiService } from '../../../services/outreach-api.service';
import { LoggerService } from '../../../services/logger.service';
import { CommonModule } from '@angular/common';
import { PreloaderComponent } from '../../../shared/preloader/preloader.component';
import { Router } from '@angular/router';
import { distinctUntilChanged, filter, forkJoin, of, Subscription, take } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { FormsModule } from '@angular/forms';
import { EmailOptionButtonComponent } from '../../../shared/email-option-button/email-option-button.component';
import { OutreachDataService } from '../../../services/outreach-data.service';
import { Contact } from '../../../models/contact.model';
import {
  ClickStreamApiService,
  ClickStreamRecord,
  TopCampaignSummary,
} from '../../../services/click-stream-api.service';
import { TopDogComponent } from '../../../shared/top-dog/top-dog.component';
import { OutreachNomenclatureService } from '../../../services/outreach-nomenclature.service';
import { SoundService } from '../../../services/sound.service';
import { OutreachAuthService } from '../../../services/outreach-auth.service';

/**
 * Ported from features/email/pages/ad-engagement/click-stream/. Swapped
 * UserService.getLoggedInContactInfo() for OutreachDataService.getContact
 * (tenantId, userId), and dropped ~180 lines of already-commented-out
 * task-generation code (generateTasksFromClickEvents and its helpers) that
 * was dead in the original file too.
 */
@Component( {
  selector: 'app-click-stream',
  templateUrl: './click-stream.component.html',
  styleUrls: ['./click-stream.component.css'],
  standalone: true,
  imports: [CommonModule, FormsModule, PreloaderComponent, EmailOptionButtonComponent]
} )
export class ClickStreamComponent extends TopDogComponent implements OnInit, OnDestroy {
  isLoadingMore = false;
  clickedEmails = new Set<string>();
  getUserSubscription!: Subscription;
  loggedInUser!: Contact;

  clickEvents: Array<Omit<ClickStreamRecord, 'timestamp'> & { timestamp: number | null; date: string; time: string; }> = [];
  topCampaigns: TopCampaignSummary[] = [];
  pageSizeOptions: number[] = [100, 250, 500, 1000];
  pageSize = 100;
  nextCursor: string | null = null;
  hasMore = false;
  error: string | null = null;
  private readonly campaignNameMap = new Map<string, string>();

  get totalRecordsLoaded (): number {
    return this.clickEvents.length;
  }

  get activeCampaignCount (): number {
    return this.topCampaigns.length;
  }

  get latestClickDate (): Date | null {
    const firstTimestamp = this.clickEvents.find( event => typeof event.timestamp === 'number' )?.timestamp;
    return typeof firstTimestamp === 'number' ? new Date( firstTimestamp ) : null;
  }

  constructor (
    protected override nomenclatureService: OutreachNomenclatureService,
    protected override soundService: SoundService,
    protected override authService: OutreachAuthService,
    protected override logger: LoggerService,
    protected override router: Router,
    private dataService: OutreachDataService,
    private outreachApi: OutreachApiService,
    private clickStreamApiService: ClickStreamApiService
  ) {
    super( authService, soundService, logger, router, nomenclatureService );
  }

  override ngOnInit (): void {
    super.ngOnInit();

    this.readySubscription = this.ready$
      .pipe(
        distinctUntilChanged(),
        filter( Boolean ),
        take( 1 )
      )
      .subscribe( () => this.setupPage() );
  }

  override ngOnDestroy (): void {
    super.ngOnDestroy();
    if ( this.getUserSubscription ) {
      this.getUserSubscription.unsubscribe();
    }
  }

  setupPage (): void {
    this.loadData();

    if ( this.tenantId && this.userId ) {
      this.dataService.getContact( this.tenantId, this.userId ).then( contact => {
        if ( contact ) {
          this.loggedInUser = contact;
        }
      } ).catch( () => { } );
    }
  }

  onEmail ( emailAddress: string | undefined ) {
    if ( !emailAddress ) {
      return;
    }

    this.outreachApi.getOutreachContactByEmail( emailAddress, {
      tenantId: this.tenantId,
      userId: this.userId,
      userEmail: this.loggedInUser?.emailAddresses?.[0]?.emailAddress || undefined
    } ).subscribe( ( response ) => {
      const contact = response?.data;
      if ( contact && contact.id ) {
        const url = this.router.serializeUrl(
          this.router.createUrlTree( ['/compose-email'], {
            queryParams: { id: contact.id },
          } )
        );
        window.open( url, 'compose-email-tab' );
      }
    } );
  }

  loadData ( append: boolean = false ): void {
    if ( append ) {
      this.isLoadingMore = true;
    } else {
      this.isLoading = true;
      this.error = null;
      this.nextCursor = null;
      this.hasMore = false;
    }

    this.clickStreamApiService.getClickStream( {
      pageSize: this.pageSize,
      cursor: append ? this.nextCursor : null,
    } ).subscribe( {
      next: ( response ) => {
        const result = response?.data;
        const records = Array.isArray( result?.records ) ? result.records : [];

        const mapped = records.map( ( event: ClickStreamRecord ) => {
          const timestamp = event?.timestamp ? new Date( event.timestamp ) : null;
          return {
            email: event?.email || 'Unknown',
            url: event?.url || '',
            date: timestamp ? timestamp.toLocaleDateString() : 'N/A',
            time: timestamp ? timestamp.toLocaleTimeString() : 'N/A',
            campaign: event?.campaign || 'N/A',
            timestamp: event?.timestamp || null,
          };
        } );

        this.clickEvents = append ? [...this.clickEvents, ...mapped] : mapped;
        this.topCampaigns = Array.isArray( result?.summary?.topCampaigns ) ? result.summary.topCampaigns : [];
        this.resolveCampaignNames();
        this.nextCursor = result?.nextCursor || null;
        this.hasMore = !!result?.hasMore;
        this.error = null;
        this.isLoading = false;
        this.isLoadingMore = false;
      },
      error: ( error ) => {
        this.logger.error( 'Failed to load click stream from backend.', error );
        this.error = error?.error?.message || 'Unable to load click stream right now.';
        if ( !append ) {
          this.clickEvents = [];
          this.topCampaigns = [];
          this.nextCursor = null;
          this.hasMore = false;
        }
        this.isLoading = false;
        this.isLoadingMore = false;
      }
    } );
  }

  loadMore (): void {
    if ( this.isLoadingMore || !this.hasMore || !this.nextCursor ) {
      return;
    }

    this.loadData( true );
  }

  onPageSizeChange (): void {
    this.loadData();
  }

  onView ( _id: string ): void {
    this.router.navigate( ['/signal-engine'] );
  }

  getCampaignLabel ( campaign: string | undefined | null ): string {
    const value = ( campaign || '' ).trim();
    if ( !value || value === 'N/A' ) return 'Unassigned';
    return this.campaignNameMap.get( value ) || value;
  }

  private resolveCampaignNames (): void {
    const ids = Array.from(
      new Set(
        [
          ...this.topCampaigns.map( c => c?.campaign ),
          ...this.clickEvents.map( event => event?.campaign )
        ]
          .map( value => ( value || '' ).trim() )
          .filter( value => !!value && value !== 'N/A' && !this.campaignNameMap.has( value ) )
      )
    );

    if ( ids.length === 0 ) {
      return;
    }

    const requests = ids.map( id =>
      this.outreachApi.getSequenceById( id, {
        tenantId: this.tenantId,
        userId: this.userId,
        userEmail: this.loggedInUser?.emailAddresses?.[0]?.emailAddress || undefined
      } ).pipe(
        map( response => ( {
          id,
          name: response?.data?.name?.trim() || response?.data?.subject?.trim() || id
        } ) ),
        catchError( () => of( { id, name: id } ) )
      )
    );

    forkJoin( requests ).subscribe( results => {
      for ( const result of results ) {
        this.campaignNameMap.set( result.id, result.name );
      }
    } );
  }

  onContact ( emailAddress: string ) {
    this.outreachApi.getOutreachContactByEmail( emailAddress, {
      tenantId: this.tenantId,
      userId: this.userId,
      userEmail: this.loggedInUser?.emailAddresses?.[0]?.emailAddress || undefined
    } ).subscribe( response => {
      const contact = response?.data;
      this.logger.info( "Contact Retrived based on email", emailAddress, contact );
      if ( contact && contact.id )
        this.craftEmail( contact );
      this.clickedEmails.add( emailAddress );
    } );
  }

  craftEmail ( contact: any ) {
    const url = this.router.serializeUrl(
      this.router.createUrlTree( ['/compose-email'], {
        queryParams: { id: contact.id }
      } )
    );
    window.open( url, 'compose-email-tab' );
  }
}
