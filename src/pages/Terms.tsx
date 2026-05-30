import { useEffect, useState, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { ArrowUp } from "lucide-react";
import LevelUpWordmark from "@/components/LevelUpWordmark";
import Footer from "@/components/Footer";
import usePageTitle from "@/hooks/usePageTitle";

const tocSections = [
  { id: "welcome", label: "1. Welcome to LevelUp Learning" },
  { id: "access-use", label: "2. Access and Use of the Service" },
  { id: "conditions", label: "3. Conditions of Use" },
  { id: "fees", label: "4. Fees" },
  { id: "subscriptions", label: "5. Recurring Subscriptions" },
  { id: "international", label: "6. Special Notice for International Use" },
  { id: "commercial", label: "7. Commercial Use" },
  { id: "ip-rights", label: "8. Intellectual Property Rights" },
  { id: "third-party", label: "9. Third Party Websites" },
  { id: "social", label: "10. Social Networking Services" },
  { id: "indemnity", label: "11. Indemnity and Release" },
  { id: "disclaimer", label: "12. Disclaimer of Warranties" },
  { id: "liability", label: "13. Limitation of Liability" },
  { id: "arbitration", label: "14. Binding Arbitration; Class Action Waiver" },
  { id: "termination", label: "15. Termination" },
  { id: "disputes", label: "16. Disputes between Users" },
  { id: "general", label: "17. General" },
  { id: "contact", label: "18. Questions? Concerns? Suggestions?" },
];

const Terms = () => {
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [activeId, setActiveId] = useState<string>("");
  const observerRef = useRef<IntersectionObserver | null>(null);

  usePageTitle("Terms of Service");

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    const handleScroll = () => setShowBackToTop(window.scrollY > 600);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        const visible = entries.find((e) => e.isIntersecting);
        if (visible) setActiveId(visible.target.id);
      },
      { rootMargin: "-20% 0px -75% 0px" }
    );
    tocSections.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observerRef.current?.observe(el);
    });
    return () => observerRef.current?.disconnect();
  }, []);

  const scrollToTop = useCallback(
    () => window.scrollTo({ top: 0, behavior: "smooth" }),
    []
  );

  return (
    <div className="min-h-screen bg-canvas flex flex-col">
      <header className="border-b border-border bg-canvas/90 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" aria-label="LevelUp home" className="text-foreground">
            <LevelUpWordmark className="h-8 w-auto" />
          </Link>
          <Link
            to="/login"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Sign in
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-3xl mx-auto px-6 py-12 md:py-16 w-full">
        <h1 className="text-3xl md:text-4xl font-semibold text-foreground tracking-tight mb-2">
          Terms of <span className="font-serif-italic text-cream">Service</span>
        </h1>
        <p className="text-sm text-muted-foreground mb-2">
          Last Updated: 28th August 2025
        </p>
        <p className="text-sm text-muted-foreground mb-10">
          See also our{" "}
          <Link to="/privacy" className="text-cream hover:underline">
            Privacy Policy
          </Link>{" "}
          and{" "}
          <Link to="/refunds" className="text-cream hover:underline">
            Refund Policy
          </Link>
          .
        </p>

        {/* Table of Contents */}
        <nav className="bg-surface border border-border rounded-lg p-6 mb-12 print:hidden">
          <h2 className="text-lg font-semibold text-foreground mb-4">
            Table of Contents
          </h2>
          <ol className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
            {tocSections.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className={`transition-colors ${
                    activeId === s.id
                      ? "text-cream font-medium"
                      : "text-muted-foreground hover:text-cream"
                  }`}
                  onClick={(e) => {
                    e.preventDefault();
                    document
                      .getElementById(s.id)
                      ?.scrollIntoView({ behavior: "smooth" });
                  }}
                >
                  {s.label}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="space-y-0 text-sm md:text-base text-muted-foreground leading-relaxed">
          <section id="welcome" className="border-b border-border pb-8 mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-3">
              1. Welcome to LevelUp Learning
            </h2>
            <h3 className="text-lg font-medium text-foreground mb-2">
              Introduction
            </h3>
            <p>
              LevelUp Learning provides its services (described below) to you
              through its website located at www.leveluplearning.in (the
              "Site") and through its mobile applications and related services
              (collectively, such services, including any new features and
              applications, and the Site, the "Service(s)"), subject to the
              following Terms of Service (as amended from time to time, the
              "Terms of Service").
            </p>
            <div className="bg-surface-2 border-l-2 border-cream p-4 rounded mt-4">
              <p className="font-medium text-foreground text-sm">
                PLEASE READ THESE TERMS OF SERVICE CAREFULLY, AS THEY GOVERN
                YOUR USE OF THE SITE AND SERVICES, PARTICULARLY SECTION 14
                (BINDING ARBITRATION; CLASS ACTION WAIVER), WHICH AFFECTS YOUR
                RIGHTS IN THE EVENT OF A DISPUTE BETWEEN US.
              </p>
            </div>

            <h3 className="text-lg font-medium text-foreground mt-6 mb-2">
              Modifications to Terms of Service
            </h3>
            <p>
              We reserve the right, at our sole discretion, to change or modify
              portions of these Terms of Service at any time. If we do this,
              depending on the nature of the change, we will post the changes
              on this page and indicate at the top of this page the date these
              terms were last revised and/or notify you, either through the
              Services' user interface, in an email notification or through
              other reasonable means. Any such changes will become effective no
              later than fourteen (14) days after they are posted, except that
              changes addressing new functions of the Services or changes made
              for legal reasons will be effective immediately. Your continued
              use of the Service after the date any such changes become
              effective constitutes your acceptance of the new Terms of
              Service. In addition, when using certain Services, you will be
              subject to any additional terms applicable to such Services that
              may be posted on the Service from time to time.
            </p>

            <h3 className="text-lg font-medium text-foreground mt-6 mb-2">
              Privacy
            </h3>
            <p>
              At LevelUp Learning, we respect the privacy of our users. For
              details, please see our{" "}
              <Link to="/privacy" className="text-cream hover:underline">
                Privacy Policy
              </Link>
              . By using the Service, you consent to our collection and use of
              personal data as outlined therein.
            </p>
          </section>

          <section id="access-use" className="border-b border-border pb-8 mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-3">
              2. Access and Use of the Service
            </h2>

            <h3 className="text-lg font-medium text-foreground mb-2">
              Use Description
            </h3>
            <p>
              The LevelUp Learning service, and any content viewed through our
              service, is solely for your personal and non-commercial use. With
              your LevelUp Learning purchase, we grant you a limited,
              non-exclusive, non-transferable, license to access the LevelUp
              Learning content and view your course(s) through the service on a
              streaming-only basis for that purpose. Except for the foregoing
              limited license, no right, title or interest shall be transferred
              to you. You agree not to use the service for public performances.
            </p>

            <h3 className="text-lg font-medium text-foreground mt-6 mb-2">
              Your Registration Obligations
            </h3>
            <p>
              You may be required to register with LevelUp Learning in order
              to access and use certain features of the Service. If you choose
              to register for the Service, you agree to provide and maintain
              true, accurate, current and complete information about yourself
              as prompted by the Service's registration form. Registration data
              and certain other information about you are governed by our
              Privacy Policy.
            </p>

            <h3 className="text-lg font-medium text-foreground mt-6 mb-2">
              Member Account, Password and Security
            </h3>
            <p>
              Usage of any features of LevelUp Learning by representing
              yourself with someone else's username and password is violation
              of our terms of use. Proxy usage can have you barred from any
              further use of the website. You are fully responsible for all
              activities that occur under your password or account. You agree
              to (a) immediately notify LevelUp Learning of any unauthorized
              use of your password or account or any other breach of security,
              and (b) ensure that you exit from your account at the end of
              each session when accessing the Service. LevelUp Learning will
              not be liable for any loss or damage arising from your failure
              to comply with this Section.
            </p>

            <h3 className="text-lg font-medium text-foreground mt-6 mb-2">
              Modifications to Service
            </h3>
            <p>
              LevelUp Learning reserves the right to modify or discontinue,
              temporarily or permanently, the Service (or any part thereof)
              with or without notice. You agree that LevelUp Learning will not
              be liable to you or to any third party for any modification,
              suspension or discontinuance of the Service. We have no
              obligation to retain any of Your Account or Submitted Content
              for any period of time beyond what may be required by applicable
              law.
            </p>

            <h3 className="text-lg font-medium text-foreground mt-6 mb-2">
              General Practices Regarding Use and Storage
            </h3>
            <p>
              You acknowledge that LevelUp Learning may establish general
              practices and limits concerning use of the Service, including
              without limitation the maximum period of time that data or other
              content will be retained by the Service and the maximum storage
              space that will be allotted on LevelUp Learning's servers on
              your behalf. You agree that LevelUp Learning has no
              responsibility or liability for the deletion or failure to store
              any data or other content maintained or uploaded by the Service.
              You acknowledge that LevelUp Learning reserves the right to
              terminate accounts that are inactive for an extended period. You
              further acknowledge that LevelUp Learning reserves the right to
              change these general practices and limits at any time, in its
              sole discretion, with or without notice.
            </p>

            <h3 className="text-lg font-medium text-foreground mt-6 mb-2">
              Mobile Services
            </h3>
            <p>
              The Service includes certain services that are available via a
              mobile device, including (i) the ability to upload content to
              the Service via a mobile device, (ii) the ability to browse the
              Service and the Site from a mobile device and (iii) the ability
              to access certain features through an application downloaded and
              installed on a mobile device (collectively, the "Mobile
              Services"). To the extent you access the Service through a
              mobile device, your wireless service carrier's standard charges,
              data rates and other fees may apply. In addition, downloading,
              installing, or using certain Mobile Services may be prohibited
              or restricted by your carrier, and not all Mobile Services may
              work with all carriers or devices. By using the Mobile Services,
              you agree that we may communicate with you regarding LevelUp
              Learning and other entities by SMS, MMS, text message or other
              electronic means to your mobile device and that certain
              information about your usage of the Mobile Services may be
              communicated to us. In the event you change or deactivate your
              mobile telephone number, you agree to promptly update your
              LevelUp Learning account information to ensure that your
              messages are not sent to the person that acquires your old
              number.
            </p>
          </section>

          <section id="conditions" className="border-b border-border pb-8 mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-3">
              3. Conditions of Use
            </h2>
            <h3 className="text-lg font-medium text-foreground mb-2">
              User Conduct
            </h3>
            <p>
              You are solely responsible for all code, video, images,
              information, data, text, software, music, sound, photographs,
              graphics, messages or other materials ("content") that you
              upload, post, publish or display (hereinafter, "upload") or
              email or otherwise use via the Service. LevelUp Learning
              reserves the right to investigate and take appropriate legal
              action against anyone who, in LevelUp Learning's sole
              discretion, violates this provision, including without
              limitation, removing the offending content from the Service,
              suspending or terminating the account of such violators and
              reporting you to the law enforcement authorities. You agree to
              not use the Service to:
            </p>
            <ul className="list-disc pl-6 mt-3 space-y-2">
              <li>
                Email or otherwise upload any content that (i) infringes any
                intellectual property or other proprietary rights of any
                party; (ii) you do not have a right to upload under any law or
                under contractual or fiduciary relationships; (iii) contains
                software viruses or any other computer code, files or programs
                designed to interrupt, destroy or limit the functionality of
                any computer software or hardware or telecommunications
                equipment; (iv) poses or creates a privacy or security risk to
                any person; (v) constitutes unsolicited or unauthorized
                advertising, promotional materials, commercial activities
                and/or sales, "junk mail," "spam," "chain letters," "pyramid
                schemes," "contests," "sweepstakes," or any other form of
                solicitation; (vi) is unlawful, harmful, threatening, abusive,
                harassing, tortious, excessively violent, defamatory, vulgar,
                obscene, pornographic, libelous, invasive of another's
                privacy, hateful racially, ethnically or otherwise
                objectionable; or (vii) in the sole judgment of LevelUp
                Learning, is objectionable or which restricts or inhibits any
                other person from using or enjoying the Service, or which may
                expose LevelUp Learning or its users to any harm or liability
                of any type;
              </li>
              <li>
                Interfere with or disrupt the Service or servers or networks
                connected to the Service, or disobey any requirements,
                procedures, policies or regulations of networks connected to
                the Service;
              </li>
              <li>
                Violate any applicable local, state, national or international
                law, or any regulation having the force of law;
              </li>
              <li>
                Impersonate any person or entity, or falsely state or
                otherwise misrepresent your affiliation with a person or
                entity;
              </li>
              <li>Solicit personal information from anyone under the age of 18;</li>
              <li>
                Harvest or collect email addresses or other contact
                information of other users from the Service by electronic or
                other means for the purposes of sending unsolicited emails or
                other unsolicited communications;
              </li>
              <li>
                Advertise or offer to sell or buy any goods or services for
                any business purpose that is not specifically authorized;
              </li>
              <li>
                Further or promote any criminal activity or enterprise or
                provide instructional information about illegal activities;
              </li>
              <li>
                Obtain or attempt to access or otherwise obtain any materials
                or information through any means not intentionally made
                available or provided for through the Service.
              </li>
            </ul>
          </section>

          <section id="fees" className="border-b border-border pb-8 mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-3">4. Fees</h2>
            <p>
              To the extent the Service or any portion thereof is made
              available for any fee, you will be required to select a payment
              plan and provide LevelUp Learning information regarding your
              credit card or other payment instrument. You represent and
              warrant to LevelUp Learning that such information is true and
              that you are authorized to use the payment instrument. You will
              promptly update your account information with any changes (for
              example, a change in your billing address or credit card
              expiration date) that may occur. You agree to pay LevelUp
              Learning the amount that is specified in the payment plan in
              accordance with the terms of such plan and this Terms of
              Service. You hereby authorize LevelUp Learning to bill your
              payment instrument in accordance with the terms of the
              applicable payment plan until you terminate your account, and
              you further agree to pay any charges so incurred. If you dispute
              any charges you must let LevelUp Learning know within sixty (60)
              days after the date that LevelUp Learning charges you. We
              reserve the right to change LevelUp Learning's prices. LevelUp
              Learning will notify such changes through ordinary recourse such
              as via email or other electronic media. Your continued use of
              the Service after the price change becomes effective constitutes
              your agreement to pay the changed amount. You shall be
              responsible for all taxes associated with the Services other
              than Indian taxes based on LevelUp Learning's net income. For
              refund eligibility and process, see our{" "}
              <Link to="/refunds" className="text-cream hover:underline">
                Refund Policy
              </Link>
              .
            </p>
          </section>

          <section id="subscriptions" className="border-b border-border pb-8 mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-3">
              5. Recurring Subscriptions
            </h2>
            <p>
              If you select a Service with an auto renewal feature ("Recurring
              Subscription"), you authorize LevelUp Learning to maintain your
              account information and charge that account automatically upon
              the renewal of the Service you choose with no further action
              required by you. In the event that LevelUp Learning is unable to
              charge your account as authorized by you when you enrolled in a
              Recurring Subscription, LevelUp Learning may, in its sole
              discretion: (i) bill you for your Service and suspend your
              access to the Service until payment is received, and/or (ii)
              seek to update your account information through third party
              sources (i.e., your bank or a payment processor) to continue
              charging your account as authorized by you.
            </p>
          </section>

          <section id="international" className="border-b border-border pb-8 mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-3">
              6. Special Notice for International Use; Export Controls
            </h2>
            <p>
              Software (defined below) available in connection with the
              Service and the transmission of applicable data, if any, is
              subject to United States export controls. No Software may be
              downloaded from the Service or otherwise exported or re-exported
              in violation of Indian export laws. Downloading or using the
              Software is at your sole risk. Recognizing the global nature of
              the Internet, you agree to comply with all local rules and laws
              regarding your use of the Service, including as it concerns
              online conduct and acceptable content.
            </p>
          </section>

          <section id="commercial" className="border-b border-border pb-8 mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-3">
              7. Commercial Use
            </h2>
            <p>
              Unless otherwise expressly authorized herein or by LevelUp
              Learning in writing, you agree not to display, distribute,
              license, perform, publish, reproduce, duplicate, copy, create
              derivative works from, modify, sell, resell, exploit, transfer
              or upload for any commercial purposes, any portion of the
              Service, use of the Service, or access to the Service.
            </p>
          </section>

          <section id="ip-rights" className="border-b border-border pb-8 mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-3">
              8. Intellectual Property Rights
            </h2>

            <h3 className="text-lg font-medium text-foreground mb-2">
              8.1 Service Content, Software and Trademarks
            </h3>
            <p>
              You acknowledge and agree that the Service may contain content
              or features ("Service Content") that are protected by copyright,
              patent, trademark, trade secret or other proprietary rights and
              laws. Except as expressly authorized by LevelUp Learning, you
              agree not to modify, copy, frame, scrape, rent, lease, loan,
              sell, distribute or create derivative works based on the
              Service or the Service Content, in whole or in part, except
              that the foregoing does not apply to your own User Content (as
              defined below) that you legally upload to the Service. In
              connection with your use of the Service you will not engage in
              or use any data mining, robots, scraping or similar data
              gathering or extraction methods. If you are blocked by LevelUp
              Learning from accessing the Service (including blocking your IP
              address), you agree not to implement any measures to circumvent
              such blocking (e.g., by masking your IP address or using a
              proxy IP address). Any use of the Service or the Service
              Content other than as specifically authorized herein is
              strictly prohibited. The technology and software underlying the
              Service or distributed in connection therewith are the property
              of LevelUp Learning, our affiliates and our partners (the
              "Software"). You agree not to copy, modify, create a derivative
              work of, reverse engineer, reverse assemble or otherwise
              attempt to discover any source code, sell, assign, sublicense,
              or otherwise transfer any right in the Software. LevelUp
              Learning reserves any rights not expressly granted herein. The
              LevelUp Learning name and logos are trademarks and service
              marks of LevelUp Learning (collectively the "LevelUp Learning
              Trademarks"). Other LevelUp Learning, product, and service
              names and logos used and displayed via the Service may be
              trademarks or service marks of their respective owners who may
              or may not endorse or be affiliated with or connected to
              LevelUp Learning. Nothing in this Terms of Service or the
              Service should be construed as granting, by implication,
              estoppel, or otherwise, any license or right to use any of
              LevelUp Learning Trademarks displayed on the Service, without
              our prior written permission in each instance. All goodwill
              generated from the use of LevelUp Learning Trademarks will
              inure to our exclusive benefit.
            </p>

            <h3 className="text-lg font-medium text-foreground mt-6 mb-2">
              8.2 Third Party Material
            </h3>
            <p>
              Under no circumstances will LevelUp Learning be liable in any
              way for any content or materials of any third parties
              (including users), including, but not limited to, for any
              errors or omissions in any content, or for any loss or damage
              of any kind incurred as a result of the use of any such
              content. You acknowledge that LevelUp Learning does not
              pre-screen content, but that LevelUp Learning and its designees
              will have the right (but not the obligation) in their sole
              discretion to refuse or remove any content that is available
              via the Service. Without limiting the foregoing, LevelUp
              Learning and its designees will have the right to remove any
              content that violates these Terms of Service or is deemed by
              LevelUp Learning, in its sole discretion, to be otherwise
              objectionable. You agree that you must evaluate, and bear all
              risks associated with, the use of any content, including any
              reliance on the accuracy, completeness, or usefulness of such
              content.
            </p>

            <h3 className="text-lg font-medium text-foreground mt-6 mb-2">
              8.3 User Content Transmitted Through the Service
            </h3>
            <p>
              With respect to the content or other materials you upload
              through the Service or share with other users or recipients
              (collectively, "User Content"), you represent and warrant that
              you own all right, title and interest in and to such User
              Content, including, without limitation, all copyrights and
              rights of publicity contained therein.
            </p>
            <p className="mt-3">
              By uploading any User Content you hereby grant and will grant
              LevelUp Learning, its affiliated companies and partners
              (including but not limited to LevelUp Learning instructors,
              practitioners and other third parties providing instructional
              information through the Services, collectively "partners") a
              non-exclusive, worldwide, royalty free, fully paid up,
              transferable, sublicensable, perpetual, irrevocable license to
              copy, display, upload, adapt, perform, publish, distribute
              (through multiple tiers of distribution and partnerships),
              store, modify and otherwise use and fully exploit your User
              Content in any and all media, form, medium, technology or
              distribution methods now known or later developed and for any
              and all purposes (commercial or otherwise).
            </p>
            <p className="mt-3">
              You acknowledge and agree that any questions, comments,
              suggestions, ideas, feedback or other information relevant to
              the Service ("Submissions"), provided by you to LevelUp
              Learning, its affiliated companies or partners are
              non-confidential and LevelUp Learning, its affiliated companies
              and partners will be entitled to the unrestricted use and
              dissemination of these Submissions for any purpose, commercial
              or otherwise, without acknowledgment or compensation to you.
            </p>
            <p className="mt-3">
              You acknowledge and agree that LevelUp Learning may preserve
              content and may also disclose content if required to do so by
              law or in the good faith belief that such preservation or
              disclosure is reasonably necessary to: (a) comply with legal
              process, applicable laws or government requests; (b) enforce
              these Terms of Service; (c) respond to claims that any content
              violates the rights of third parties; or (d) protect the
              rights, property, or personal safety of LevelUp Learning, its
              users and the public. You understand that the technical
              processing and transmission of the Service, including your
              content, may involve (a) transmissions over various networks;
              and (b) changes to conform and adapt to technical requirements
              of connecting networks or devices.
            </p>

            <h3 className="text-lg font-medium text-foreground mt-6 mb-2">
              8.4 Copyright Complaints
            </h3>
            <p>
              LevelUp Learning respects the intellectual property of others,
              and we ask our users to do the same. If you believe that your
              work has been copied in a way that constitutes copyright
              infringement, or that your intellectual property rights have
              been otherwise violated, you should notify LevelUp Learning of
              your infringement claim in accordance with the procedure set
              forth below.
            </p>
            <p className="mt-3">
              You may also contact us by mail or facsimile at:{" "}
              <a
                href="mailto:admin@leveluplearning.in"
                className="text-cream hover:underline"
              >
                admin@leveluplearning.in
              </a>
            </p>
            <p className="mt-2">
              Address: LEVEL UP EDU PVT. LTD, Old no. 9 New no. 17, Seethammal
              Road, Seethammal Colony, Alwarpet, Chennai, Tamil Nadu 600018.
            </p>

            <h3 className="text-lg font-medium text-foreground mt-6 mb-2">
              8.5 Counter-Notice
            </h3>
            <p>
              If you believe that your User Content that was removed (or to
              which access was disabled) is not infringing, or that you have
              the authorization from the copyright owner, the copyright
              owner's agent, or pursuant to the law, to upload and use the
              content in your User Content, you may send a written
              counter-notice containing the following information to the
              Copyright Agent: your physical or electronic signature;
              identification of the content that has been removed or to which
              access has been disabled and the location at which the content
              appeared before it was removed or disabled; a statement that
              you have a good faith belief that the content was removed or
              disabled as a result of mistake or a misidentification of the
              content; and your name, address, telephone number, and email
              address, a statement that you consent to the jurisdiction of
              the Courts of Tamil Nadu and a statement that you will accept
              service of process from the person who provided notification of
              the alleged infringement.
            </p>

            <h3 className="text-lg font-medium text-foreground mt-6 mb-2">
              8.6 Repeat Infringer Policy
            </h3>
            <p>
              LevelUp Learning has adopted a policy of terminating, in
              appropriate circumstances and at LevelUp Learning's sole
              discretion, users who are deemed to be repeat infringers.
              LevelUp Learning may also at its sole discretion limit access
              to the Service and/or terminate the memberships of any users
              who infringe any intellectual property rights of others,
              whether or not there is any repeat infringement.
            </p>
          </section>

          <section id="third-party" className="border-b border-border pb-8 mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-3">
              9. Third Party Websites
            </h2>
            <p>
              The Service may provide, or third parties may provide, links or
              other access to other sites and resources on the Internet.
              LevelUp Learning has no control over such sites and resources
              and LevelUp Learning is not responsible for and does not
              endorse such sites and resources. You further acknowledge and
              agree that LevelUp Learning will not be responsible or liable,
              directly or indirectly, for any damage or loss caused or
              alleged to be caused by or in connection with use of or
              reliance on any content, events, goods or services available on
              or through any such site or resource. Any dealings you have
              with third parties found while using the Service are between
              you and the third party, and you agree that LevelUp Learning is
              not liable for any loss or claim that you may have against any
              such third party.
            </p>
          </section>

          <section id="social" className="border-b border-border pb-8 mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-3">
              10. Social Networking Services
            </h2>
            <p>
              You may enable or log in to the Service via various online
              third party services, such as social media and social
              networking services like Facebook ("Social Networking
              Services"). By logging in or directly integrating these Social
              Networking Services into the Service, we make your online
              experiences richer and more personalized. To take advantage of
              this feature and capabilities, we may ask you to authenticate,
              register for or log into Social Networking Services on the
              websites of their respective providers. As part of such
              integration, the Social Networking Services will provide us
              with access to certain information that you have provided to
              such Social Networking Services, and we will use, store and
              disclose such information in accordance with our Privacy
              Policy. For more information about the implications of
              activating these Social Networking Services and LevelUp
              Learning's use, storage and disclosure of information related
              to you and your use of such services within LevelUp Learning
              (including your friend lists and the like), please see our
              Privacy Policy. However, please remember that the manner in
              which Social Networking Services use, store and disclose your
              information is governed solely by the policies of such third
              parties, and LevelUp Learning shall have no liability or
              responsibility for the privacy practices or other actions of
              any third party site or service that may be enabled within the
              Service. In addition, LevelUp Learning is not responsible for
              the accuracy, availability or reliability of any information,
              content, goods, data, opinions, advice or statements made
              available in connection with Social Networking Services. As
              such, LevelUp Learning is not liable for any damage or loss
              caused or alleged to be caused by or in connection with use of
              or reliance on any such Social Networking Services. LevelUp
              Learning enables these features merely as a convenience and the
              integration or inclusion of such features does not imply an
              endorsement or recommendation.
            </p>
          </section>

          <section id="indemnity" className="border-b border-border pb-8 mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-3">
              11. Indemnity and Release
            </h2>
            <p>
              You agree to release, indemnify and hold LevelUp Learning and
              its affiliates and their officers, employees, directors and
              agents harmless from any and all losses, damages, expenses,
              including reasonable attorneys' fees, rights, claims, actions
              of any kind and injury (including death) arising out of or
              relating to your use of the Service, any User Content, your
              connection to the Service, your violation of these Terms of
              Service or your violation of any rights of another.
            </p>
          </section>

          <section id="disclaimer" className="border-b border-border pb-8 mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-3">
              12. Disclaimer of Warranties
            </h2>
            <div className="bg-surface-2 border-l-2 border-cream p-4 rounded">
              <p className="font-medium text-foreground text-sm">
                YOUR USE OF THE SERVICE IS AT YOUR SOLE RISK. THE SERVICE IS
                PROVIDED ON AN "AS IS" AND "AS AVAILABLE" BASIS. EXCEPT AS
                OTHERWISE EXPRESSLY PROVIDED HEREIN, LEVELUP LEARNING
                EXPRESSLY DISCLAIMS ALL WARRANTIES OF ANY KIND, WHETHER
                EXPRESS, IMPLIED OR STATUTORY, INCLUDING, BUT NOT LIMITED TO
                THE IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
                PARTICULAR PURPOSE, TITLE AND NON-INFRINGEMENT. LEVELUP
                LEARNING MAKES NO WARRANTY THAT (I) THE SERVICE WILL MEET YOUR
                REQUIREMENTS, (II) THE SERVICE WILL BE UNINTERRUPTED, TIMELY,
                SECURE, OR ERROR-FREE, (III) THE RESULTS THAT MAY BE OBTAINED
                FROM THE USE OF THE SERVICE WILL BE ACCURATE OR RELIABLE, OR
                (IV) THE QUALITY OF ANY PRODUCTS, SERVICES, INFORMATION, OR
                OTHER MATERIAL PURCHASED OR OBTAINED BY YOU THROUGH THE
                SERVICE WILL MEET YOUR EXPECTATIONS.
              </p>
            </div>
          </section>

          <section id="liability" className="border-b border-border pb-8 mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-3">
              13. Limitation of Liability
            </h2>
            <div className="bg-surface-2 border-l-2 border-cream p-4 rounded">
              <p className="font-medium text-foreground text-sm">
                YOU EXPRESSLY UNDERSTAND AND AGREE THAT LEVELUP LEARNING WILL
                NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL,
                CONSEQUENTIAL, EXEMPLARY DAMAGES, OR DAMAGES FOR LOSS OF
                PROFITS INCLUDING BUT NOT LIMITED TO, DAMAGES FOR LOSS OF
                GOODWILL, USE, DATA OR OTHER INTANGIBLE LOSSES (EVEN IF
                LEVELUP LEARNING HAS BEEN ADVISED OF THE POSSIBILITY OF SUCH
                DAMAGES), WHETHER BASED ON CONTRACT, TORT, NEGLIGENCE, STRICT
                LIABILITY OR OTHERWISE, RESULTING FROM: (I) THE USE OR THE
                INABILITY TO USE THE SERVICE; (II) THE COST OF PROCUREMENT OF
                SUBSTITUTE GOODS AND SERVICES RESULTING FROM ANY GOODS, DATA,
                INFORMATION OR SERVICES PURCHASED OR OBTAINED OR MESSAGES
                RECEIVED OR TRANSACTIONS ENTERED INTO THROUGH OR FROM THE
                SERVICE; (III) UNAUTHORIZED ACCESS TO OR ALTERATION OF YOUR
                TRANSMISSIONS OR DATA; (IV) STATEMENTS OR CONDUCT OF ANY
                THIRD PARTY ON THE SERVICE; OR (V) ANY OTHER MATTER RELATING
                TO THE SERVICE. IN NO EVENT WILL LEVELUP LEARNING'S TOTAL
                LIABILITY TO YOU FOR ALL DAMAGES, LOSSES OR CAUSES OF ACTION
                EXCEED THE AMOUNT YOU HAVE PAID LEVELUP LEARNING IN THE LAST
                SIX (6) MONTHS.
              </p>
            </div>
            <p className="mt-4">
              SOME JURISDICTIONS DO NOT ALLOW THE EXCLUSION OF CERTAIN
              WARRANTIES OR THE LIMITATION OR EXCLUSION OF LIABILITY FOR
              INCIDENTAL OR CONSEQUENTIAL DAMAGES. ACCORDINGLY, SOME OF THE
              ABOVE LIMITATIONS SET FORTH ABOVE MAY NOT APPLY TO YOU. IF YOU
              ARE DISSATISFIED WITH ANY PORTION OF THE SERVICE OR WITH THESE
              TERMS OF SERVICE, YOUR SOLE AND EXCLUSIVE REMEDY IS TO
              DISCONTINUE USE OF THE SERVICE.
            </p>
          </section>

          <section id="arbitration" className="border-b border-border pb-8 mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-3">
              14. Binding Arbitration; Class Action Waiver
            </h2>
            <p>
              At LevelUp Learning's or your election, all disputes, claims, or
              controversies arising out of or relating to the Terms of Service
              or the Service that are not resolved by mutual agreement may be
              resolved by individual (not group) binding arbitration to be
              conducted before a lawyer. Unless otherwise agreed by the
              parties, arbitration will be held in Tamil Nadu before a single
              arbitrator mutually agreed upon by the parties, or if the
              parties cannot mutually agree, and will be conducted in
              accordance with the rules and regulations promulgated unless
              specifically modified in the Terms of Service. The arbitration
              must commence within forty-five (45) days of the date on which a
              written demand for arbitration is filed by either party. The
              arbitrator's decision and award will be made and delivered
              within sixty (60) days of the conclusion of the arbitration and
              within six (6) months of the selection of the arbitrator. The
              arbitrator will not have the power to award damages in excess of
              the limitation on actual compensatory, direct damages set forth
              in the Terms of Service and may not multiply actual damages or
              award punitive damages or any other damages that are
              specifically excluded under the Terms of Service, and each party
              hereby irrevocably waives any claim to such damages. The
              arbitrator may, in his or her discretion, assess costs and
              expenses (including the reasonable legal fees and expenses of
              the prevailing party) against any party to a proceeding. Any
              party refusing to comply with an order of the arbitrators will
              be liable for costs and expenses, including attorneys' fees,
              incurred by the other party in enforcing the award.
              Notwithstanding the foregoing, in the case of temporary or
              preliminary injunctive relief, any party may proceed in court
              without prior arbitration for the purpose of avoiding immediate
              and irreparable harm. The provisions of this arbitration section
              will be enforceable in any court of competent jurisdiction.
            </p>
            <div className="bg-surface-2 border-l-2 border-cream p-4 rounded mt-4">
              <p className="font-medium text-foreground text-sm">
                YOU UNDERSTAND AND AGREE THAT THE ABOVE DISPUTE PROCEDURES
                SHALL BE YOUR SOLE REMEDY IN THE EVENT OF DISPUTE BETWEEN YOU
                AND LEVELUP LEARNING REGARDING ANY ASPECT OF THE SERVICE
                (INCLUDING THE ENROLMENT PROCESS) AND THAT YOU ARE WAIVING
                YOUR RIGHT TO LEAD OR PARTICIPATE IN A LAWSUIT INVOLVING OTHER
                PERSONS, SUCH AS A CLASS ACTION.
              </p>
            </div>
          </section>

          <section id="termination" className="border-b border-border pb-8 mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-3">
              15. Termination
            </h2>
            <p>
              You agree that LevelUp Learning, in its sole discretion, may
              suspend or terminate your account (or any part thereof) or use
              of the Service and remove and discard any content within the
              Service, for any reason, including, without limitation, for
              lack of use or if LevelUp Learning believes that you have
              violated or acted inconsistently with the letter or spirit of
              these Terms of Service. Any suspected fraudulent, abusive or
              illegal activity that may be grounds for termination of your
              use of Service, may be referred to appropriate law enforcement
              authorities. LevelUp Learning may also in its sole discretion
              and at any time discontinue providing the Service, or any part
              thereof, with or without notice. You agree that any termination
              of your access to the Service under any provision of this Terms
              of Service may be effected without prior notice, and
              acknowledge and agree that LevelUp Learning may immediately
              deactivate or delete your account and all related information
              and files in your account and/or bar any further access to such
              files or the Service. Further, you agree that LevelUp Learning
              will not be liable to you or any third party for any
              termination of your access to the Service.
            </p>
          </section>

          <section id="disputes" className="border-b border-border pb-8 mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-3">
              16. Disputes between Users
            </h2>
            <p>
              You agree that you are solely responsible for your interactions
              with any other user in connection with the Service and LevelUp
              Learning will have no liability or responsibility with respect
              thereto. LevelUp Learning reserves the right, but has no
              obligation, to become involved in any way with disputes between
              you and any other user of the Service.
            </p>
          </section>

          <section id="general" className="border-b border-border pb-8 mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-3">
              17. General
            </h2>
            <p>
              These Terms of Service constitute the entire agreement between
              you and LevelUp Learning and govern your use of the Service,
              superseding any prior agreements between you and LevelUp
              Learning with respect to the Service. You also may be subject
              to additional terms and conditions that may apply when you use
              affiliate or third party services, third party content or third
              party software. These Terms of Service will be governed by the
              laws of the State of Tamil Nadu without regard to its conflict
              of law provisions. With respect to any disputes or claims not
              subject to arbitration, as set forth in Section 14 above, you
              and LevelUp Learning agree to submit to the personal and
              exclusive jurisdiction of the state and high courts located
              within Tamil Nadu, India. The failure of LevelUp Learning to
              exercise or enforce any right or provision of these Terms of
              Service will not constitute a waiver of such right or
              provision. If any provision of these Terms of Service is found
              by a court of competent jurisdiction to be invalid, the parties
              nevertheless agree that the court should endeavour to give
              effect to the parties' intentions as reflected in the
              provision, and the other provisions of these Terms of Service
              remain in full force and effect. You agree that regardless of
              any statute or law to the contrary, any claim or cause of
              action arising out of or related to use of the Service or these
              Terms of Service must be filed within one (1) year after such
              claim or cause of action arose or be forever barred. A printed
              version of this agreement and of any notice given in electronic
              form will be admissible in judicial or administrative
              proceedings based upon or relating to this agreement to the
              same extent and subject to the same conditions as other
              business documents and records originally generated and
              maintained in printed form. You may not assign this Terms of
              Service without the prior written consent of LevelUp Learning,
              but LevelUp Learning may assign or transfer this Terms of
              Service, in whole or in part, without restriction. The section
              titles in these Terms of Service are for convenience only and
              have no legal or contractual effect. Notices to you may be made
              via either email or regular mail. The Service may also provide
              notices to you of changes to these Terms of Service or other
              matters by displaying notices or links to notices generally on
              the Service.
            </p>
          </section>

          <section id="contact">
            <h2 className="text-xl font-semibold text-foreground mb-3">
              18. Questions? Concerns? Suggestions?
            </h2>
            <p>
              Please contact us at{" "}
              <a
                href="mailto:admin@leveluplearning.in"
                className="text-cream hover:underline"
              >
                admin@leveluplearning.in
              </a>{" "}
              to report any violations of these Terms of Service or to pose
              any questions regarding the Terms of Service or the Service.
            </p>
          </section>
        </div>
      </main>

      <Footer />

      {showBackToTop && (
        <button
          onClick={scrollToTop}
          className="fixed bottom-24 right-4 md:bottom-24 md:right-8 z-40 bg-cream text-cream-text p-3 rounded-full shadow-lg hover:opacity-90 transition-all print:hidden"
          aria-label="Back to top"
        >
          <ArrowUp className="h-5 w-5" />
        </button>
      )}
    </div>
  );
};

export default Terms;
