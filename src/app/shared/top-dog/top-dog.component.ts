import {
  AfterViewInit,
  Component,
  Input,
  HostListener,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { Router } from '@angular/router';
import {
  BehaviorSubject,
  Observable,
  Subscription,
  filter,
  take,
  combineLatest,
} from 'rxjs';
import { environment } from '../../../environments/environment';
import { OutreachAuthService } from '../../services/outreach-auth.service';
import { LoggerService } from '../../services/logger.service';
import { SoundService } from '../../services/sound.service';
import { OutreachNomenclatureService } from '../../services/outreach-nomenclature.service';
import { Nomenclature } from '../../models/nomenclature.model';

/**
 * Trimmed copy of core/top-dog/top-dog.component.ts - the base class
 * AdEngagementComponent, ClickStreamComponent, AdEngagementResultsComponent,
 * EmailProcessorComponent, EmailComposerParentComponent, and
 * EmailCreateComponent all `extends`. Kept: the tenantId/userId/isLoggedIn/
 * firebaseUser resolution and the ready$/pageReady$ readiness-gate contract
 * every one of those components' ngOnInit actually depends on (they all
 * subscribe to `this.ready$` before doing real work).
 *
 * Dropped, because nothing in this extraction reads them: SettingsService
 * (injected in the original but never actually called anywhere in its own
 * class body either - a dead constructor param), RoutePerfService's
 * markRendered() perf-timing call, DiagnosticComponent/toggleDiagnosticInChild
 * (no ported component calls it - confirmed by grep), and the entire
 * isSayItContext()/restrictedUser/allowedProjects/canAccessProject block
 * (SayIt is a different, single-tenant TODD surface this app has no
 * concept of; restrictedUser always resolved to false in practice, so
 * canAccessProject was an always-true no-op gate even in the original).
 */
@Component( {
  selector: 'app-top-dog',
  imports: [],
  template: '',
} )
export class TopDogComponent implements OnInit, OnDestroy, AfterViewInit {
  isLoading = false;

  nomenclature$: Observable<Nomenclature>;
  nomenclatureSubscription!: Subscription;
  @Input() nomenclature!: Nomenclature;
  readySubscription!: Subscription;

  readonly COMPANY_NAME = environment.COMPANY_NAME;

  @Input() userId!: string;

  @Input() tenantId!: any;

  isLoggedIn: boolean = false;

  isMobile: boolean = false;

  @Input() firebaseUser!: any;

  private userIdSubscription!: Subscription;
  private tenantIdSubscription!: Subscription;
  private loggedInSubscription!: Subscription;
  private firebaseUserSubscription!: Subscription;

  private readySubject = new BehaviorSubject<boolean>( false );
  public ready$ = this.readySubject.asObservable();

  private pageReadySubject = new BehaviorSubject<boolean>( false );
  public pageReady$ = this.pageReadySubject.asObservable();

  constructor (
    protected authService: OutreachAuthService,
    protected soundService: SoundService,
    protected logger: LoggerService,
    protected router: Router,
    protected nomenclatureService: OutreachNomenclatureService,
  ) {
    this.nomenclature$ = this.nomenclatureService.currentNomenclature$;
  }

  ngOnInit (): void {
    this.setFirebaseUser();
    this.setTenantId();
    this.setUserId();
    this.setLoggedIn();
    this.setNomenclature();

    this.isMobile = window.innerWidth < 768;
  }

  ngOnDestroy (): void {
    if ( this.userIdSubscription ) this.userIdSubscription.unsubscribe();
    if ( this.tenantIdSubscription ) this.tenantIdSubscription.unsubscribe();
    if ( this.loggedInSubscription ) this.loggedInSubscription.unsubscribe();
    if ( this.firebaseUserSubscription )
      this.firebaseUserSubscription.unsubscribe();
    if ( this.readySubscription ) this.readySubscription.unsubscribe();
  }

  ngAfterViewInit (): void {
    if ( this.shouldScrollPageToTopOnInit() ) {
      window.scrollTo( 0, 0 );
    }
    this.isLoading = false;

    this.readySubscription = combineLatest( [
      this.ready$.pipe( filter( Boolean ) ),
      this.pageReady$.pipe( filter( Boolean ) ),
    ] )
      .pipe( take( 1 ) )
      .subscribe( () => { } );
  }

  /** Embedded components can opt out of moving the host page on init. */
  protected shouldScrollPageToTopOnInit (): boolean {
    return true;
  }

  /**
   * Signal from child components that page content (data + DOM) is ready to measure.
   */
  public signalContentReady (): void {
    this.pageReadySubject.next( true );
  }

  setTenantId () {
    if ( !this.tenantId ) {
      this.tenantIdSubscription = this.authService
        .getTenantId()
        .subscribe( ( tenantId ) => {
          this.tenantId = tenantId || '';
          this.logger.info( 'TENANT ID', this.tenantId );
          this.checkIfReady();
        } );
    }
  }

  setUserId () {
    if ( !this.userId ) {
      this.userIdSubscription = this.authService
        .getUserId()
        .subscribe( ( userId ) => {
          this.userId = userId || '';
          this.logger.info( 'USER ID', this.userId );
          this.checkIfReady();
        } );
    }
  }

  setLoggedIn () {
    this.loggedInSubscription = this.authService
      .isLoggedIn()
      .subscribe( ( isLoggedIn ) => {
        this.isLoggedIn = isLoggedIn;
      } );
  }

  @HostListener( 'window:resize', [] )
  onResize () {
    this.isMobile = window.innerWidth < 768;
  }

  onClickRoute ( goto: string ) {
    const [path, fragment] = goto.split( '#' );
    this.router.navigate( [path], { fragment } );
  }

  setFirebaseUser (): void {
    if ( !this.firebaseUser ) {
      this.firebaseUserSubscription = this.authService
        .getUser()
        .subscribe( ( user ) => {
          this.firebaseUser = user;
          this.checkIfReady();
        } );
    }
  }

  setNomenclature () {
    if ( !this.nomenclature ) {
      this.nomenclatureSubscription = this.nomenclature$.subscribe(
        ( settings ) => {
          this.nomenclature = settings;
          this.checkIfReady();
        }
      );
    }
  }

  private checkIfReady () {
    if (
      this.firebaseUser &&
      this.userId &&
      this.tenantId !== undefined &&
      this.nomenclature != undefined
    ) {
      this.readySubject.next( true );
    }
  }
}
