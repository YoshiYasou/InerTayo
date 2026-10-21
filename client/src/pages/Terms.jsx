import React from 'react';
import { useRouter } from '../context/RouterContext';
import { 
  FileText, 
  ShieldAlert, 
  Scale, 
  AlertTriangle, 
  Bus, 
  CheckCircle2, 
  HelpCircle, 
  ArrowLeft,
  Mail,
  MapPin
} from 'lucide-react';

export default function Terms() {
  const { navigate, queryParams } = useRouter();
  const embedded = queryParams?.embed === 'signup';

  const sections = [
    { id: 'service-scope', title: '1. Service Scope & Role' },
    { id: 'non-carrier', title: '2. Informational Disclaimers & Non-Carrier Status' },
    { id: 'estimates', title: '3. Fares, Schedules, & Flood Advisories' },
    { id: 'accounts', title: '4. Commuter Accounts & Security' },
    { id: 'user-conduct', title: '5. Acceptable Use & Prohibited Conduct' },
    { id: 'user-content', title: '6. User-Submitted Feedback & Corrections' },
    { id: 'intellectual-property', title: '7. Intellectual Property' },
    { id: 'warranty-disclaimer', title: '8. Disclaimer of Warranties' },
    { id: 'limitation-liability', title: '9. Limitation of Liability' },
    { id: 'governing-law', title: '10. Governing Law & Jurisdiction' },
    { id: 'contact', title: '11. Contact Information' }
  ];

  const scrollToSection = (id) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className={`min-h-screen bg-slate-50 text-slate-800 ${embedded ? '' : 'pb-24'}`}>
      {/* Header */}
      {!embedded && <div className="bg-white border-b border-slate-200/80 pt-12 pb-12 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <button
            onClick={() => navigate('/')}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-emerald-600 transition-colors mb-6 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Route Finder
          </button>

          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 text-xs font-bold uppercase tracking-wider mb-4 border border-emerald-200">
            <FileText className="w-3.5 h-3.5 text-emerald-600" />
            Legal Documentation
          </div>

          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
            Terms and Conditions
          </h1>
          <p className="text-sm text-slate-500 mt-2">
            Last Updated: October 16, 2026 • Effective Date: October 16, 2026
          </p>
          <p className="text-slate-600 mt-4 leading-relaxed max-w-3xl text-sm sm:text-base">
            Please read these Terms and Conditions carefully before using the InerTayo web application. InerTayo is a public transportation route discovery platform for Dagupan City, Pangasinan. By accessing the site or creating an account, you agree to comply with these terms.
          </p>
        </div>
      </div>}

      {/* Main Content Layout */}
      <div className={`${embedded ? 'w-full px-4 py-4 sm:px-6' : 'max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-10'}`}>
        <div className={`grid grid-cols-1 ${embedded ? '' : 'lg:grid-cols-12 gap-8'} items-start`}>
          
          {/* Quick Jump Sidebar (Desktop) */}
          {!embedded && <aside className="hidden lg:block lg:col-span-4 sticky top-6 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Table of Contents
            </h3>
            <nav className="space-y-1 text-xs">
              {sections.map((s) => (
                <button
                  key={s.id}
                  onClick={() => scrollToSection(s.id)}
                  className="block w-full text-left py-1.5 px-2.5 rounded-lg text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 transition-colors font-medium truncate"
                >
                  {s.title}
                </button>
              ))}
            </nav>
            <div className="pt-4 border-t border-slate-100">
              <div className="p-3 bg-slate-50 rounded-xl text-[11px] text-slate-500 flex items-start gap-2">
                <HelpCircle className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                <span>Need help with routes or fare inquiries? Contact our team at <strong className="text-slate-700">support@inertayo.ph</strong>.</span>
              </div>
            </div>
          </aside>}

          {/* Legal Text Sections */}
          <main className={`${embedded ? 'w-full space-y-6 text-sm leading-relaxed' : 'lg:col-span-8 bg-white p-6 sm:p-10 rounded-2xl border border-slate-200/80 shadow-sm space-y-10 text-sm leading-relaxed'} text-slate-600`}>

            {/* Section 1 */}
            <section id="service-scope" className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs">1</div>
                <h2 className="text-lg font-bold text-slate-900">Service Scope & Role</h2>
              </div>
              <p>
                InerTayo operates as an informational public transit routing directory and commuter guidance web application tailored for Dagupan City, Pangasinan. Our service indexes multi-modal transit options—including traditional and modern jeepneys, tricycles, river ferry boats, and provincial/city buses—to compute sensible route combinations, transfer interchanges, estimated fares, and flood detours.
              </p>
              <p>
                These Terms apply to all visitors, registered commuters, administrators, and contributors who access or use InerTayo.
              </p>
            </section>

            {/* Section 2 */}
            <section id="non-carrier" className="space-y-3 border-t border-slate-100 pt-8">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs">2</div>
                <h2 className="text-lg font-bold text-slate-900">Informational Disclaimers & Non-Carrier Status</h2>
              </div>
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs sm:text-sm space-y-2">
                <div className="flex items-center gap-2 font-bold text-amber-950">
                  <ShieldAlert className="w-4 h-4 text-amber-700 flex-shrink-0" />
                  <span>Crucial Distinction: Not a Transportation Provider</span>
                </div>
                <p className="leading-relaxed">
                  InerTayo is strictly an <strong>information aggregator and routing calculation tool</strong>. InerTayo does <strong>not</strong> operate vehicles, hire drivers, issue transport franchises, or run passenger transport services. All transport services are owned and operated by independent third-party operators, drivers, transport cooperatives, and regulatory authorities.
                </p>
              </div>
            </section>

            {/* Section 3 */}
            <section id="estimates" className="space-y-3 border-t border-slate-100 pt-8">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs">3</div>
                <h2 className="text-lg font-bold text-slate-900">Fares, Schedules, & Flood Advisories</h2>
              </div>
              <p>
                While we continuously verify our database against local transport ordinances, commuters should keep the following conditions in mind:
              </p>
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  <strong>Fare Calculator:</strong> Fares displayed are estimated calculations based on baseline Land Transportation Franchising and Regulatory Board (LTFRB) fare matrices and Dagupan City tricycle zone guidelines. Actual fares may vary depending on driver special trip arrangements, night rates, or unmetered negotiations.
                </li>
                <li>
                  <strong>Travel Times & Headways:</strong> Estimated travel times and vehicle intervals depend on dynamic variables, including rush-hour choke points (e.g., Perez Blvd, AB Fernandez Ave, Lucao District), river tide currents, weather disruptions, and spontaneous vehicle queuing.
                </li>
                <li>
                  <strong>Flood & Road Advisories:</strong> Flood warnings and passable vehicle thresholds are provided for general awareness. Because tidal floods and monsoon rains in Dagupan can escalate quickly, InerTayo does not guarantee that every impassable street or sudden detour is reflected instantaneously. Commuters are advised to exercise personal discretion and heed official City Disaster Risk Reduction and Management Office (CDRRMO) announcements.
                </li>
              </ul>
            </section>

            {/* Section 4 */}
            <section id="accounts" className="space-y-3 border-t border-slate-100 pt-8">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs">4</div>
                <h2 className="text-lg font-bold text-slate-900">Commuter Accounts & Security</h2>
              </div>
              <p>
                You may register for an InerTayo Commuter account to save favorite journeys, customize default commute endpoints, and contribute transit reports.
              </p>
              <ul className="list-disc pl-5 space-y-1.5">
                <li>You must provide an authentic email address and maintain a secure password.</li>
                <li>You are solely responsible for all actions conducted under your account.</li>
                <li>You must promptly notify InerTayo if you detect any unauthorized access or security breach.</li>
                <li>We reserve the right to suspend accounts that engage in automated spam, unauthorized scraping, or malicious route manipulation.</li>
              </ul>
            </section>

            {/* Section 5 */}
            <section id="user-conduct" className="space-y-3 border-t border-slate-100 pt-8">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs">5</div>
                <h2 className="text-lg font-bold text-slate-900">Acceptable Use & Prohibited Conduct</h2>
              </div>
              <p>You agree not to use the Service to:</p>
              <ul className="list-disc pl-5 space-y-1.5">
                <li>Submit false, defamatory, deceptive, or malicious transit reports or feedback.</li>
                <li>Attempt to bypass rate limiters, reverse engineer client code, or launch denial-of-service attacks against InerTayo APIs.</li>
                <li>Harvest or scrape transit geospatial data or user data without written authorization.</li>
                <li>Impersonate city transport officials, traffic enforcers, or public utility vehicle cooperatives.</li>
              </ul>
            </section>

            {/* Section 6 */}
            <section id="user-content" className="space-y-3 border-t border-slate-100 pt-8">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs">6</div>
                <h2 className="text-lg font-bold text-slate-900">User-Submitted Feedback & Corrections</h2>
              </div>
              <p>
                When you submit feedback, route updates, or flood reports through InerTayo, you grant InerTayo a non-exclusive, perpetual, royalty-free license to analyze, verify, and incorporate that data into our public route directory to benefit fellow commuters. You warrant that your submissions do not infringe on any third party’s rights.
              </p>
            </section>

            {/* Section 7 */}
            <section id="intellectual-property" className="space-y-3 border-t border-slate-100 pt-8">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs">7</div>
                <h2 className="text-lg font-bold text-slate-900">Intellectual Property</h2>
              </div>
              <p>
                The InerTayo brand, website design, route compilation schema, custom algorithms, and UI components are the property of InerTayo and its creators. Map data is provided by OpenStreetMap contributors and rendered using CARTO basemaps; Leaflet libraries and Lucide icons remain the property of their respective rights holders under open-source licenses.
              </p>
            </section>

            {/* Section 8 */}
            <section id="warranty-disclaimer" className="space-y-3 border-t border-slate-100 pt-8">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs">8</div>
                <h2 className="text-lg font-bold text-slate-900">Disclaimer of Warranties</h2>
              </div>
              <p className="uppercase text-xs font-semibold text-slate-700 bg-slate-100 p-4 rounded-xl leading-relaxed">
                The service is provided on an "as is" and "as available" basis. InerTayo makes no representations or warranties of any kind, express or implied, regarding the continuous operation of the site, accuracy of route paths, punctual arrival of vehicles, or current water level conditions on city roads.
              </p>
            </section>

            {/* Section 9 */}
            <section id="limitation-liability" className="space-y-3 border-t border-slate-100 pt-8">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs">9</div>
                <h2 className="text-lg font-bold text-slate-900">Limitation of Liability</h2>
              </div>
              <p>
                To the fullest extent permitted by law, InerTayo and its creators shall not be liable for any direct, indirect, incidental, punitive, or consequential damages resulting from:
              </p>
              <ul className="list-disc pl-5 space-y-1.5">
                <li>Missed appointments, employment tardiness, or lost transit connections.</li>
                <li>Personal injury, vehicular accidents, or property loss during commutes.</li>
                <li>Fare overcharging or disputes between commuters and third-party transport operators.</li>
                <li>Transit disruptions caused by weather disturbances, typhoon conditions, or high tides.</li>
              </ul>
            </section>

            {/* Section 10 */}
            <section id="governing-law" className="space-y-3 border-t border-slate-100 pt-8">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs">10</div>
                <h2 className="text-lg font-bold text-slate-900">Governing Law & Jurisdiction</h2>
              </div>
              <p>
                These Terms and Conditions shall be governed by and construed in accordance with the laws of the <strong>Republic of the Philippines</strong>. Any dispute arising out of or in connection with these Terms shall be resolved exclusively in the competent courts of <strong>Dagupan City, Pangasinan</strong>.
              </p>
            </section>

            {/* Section 11 */}
            <section id="contact" className="space-y-4 border-t border-slate-100 pt-8">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs">11</div>
                <h2 className="text-lg font-bold text-slate-900">Contact Information</h2>
              </div>
              <p>
                If you have questions, feedback, or legal inquiries regarding these Terms and Conditions, please reach out to us:
              </p>
              <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-xl space-y-2 text-xs sm:text-sm">
                <div className="flex items-center gap-2 text-slate-700">
                  <Mail className="w-4 h-4 text-emerald-600" />
                  <span>Email: <strong>support@inertayo.ph</strong> or <strong>admin@inertayo.ph</strong></span>
                </div>
                <div className="flex items-center gap-2 text-slate-700">
                  <MapPin className="w-4 h-4 text-emerald-600" />
                  <span>Location: <strong>Dagupan City, Pangasinan, Philippines</strong></span>
                </div>
              </div>
            </section>

          </main>
        </div>
      </div>
    </div>
  );
}
