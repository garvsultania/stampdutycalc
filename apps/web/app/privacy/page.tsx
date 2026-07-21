export default function PrivacyPage() {
  return (
    <article className="container max-w-3xl py-10 md:py-16">
      <p className="text-xs font-semibold uppercase tracking-widest text-gold">Document-processing notice</p>
      <h1 className="mt-2 font-serif text-3xl font-semibold tracking-tight">Privacy and retention</h1>
      <div className="mt-8 space-y-6 text-sm leading-relaxed text-muted-foreground">
        <section><h2 className="font-serif text-xl font-semibold text-foreground">What is processed</h2><p className="mt-2">Document Check accepts a PDF or DOCX only after explicit consent. It asks the configured extraction provider for the fields required by the selected stamp-duty rule, with a page reference and short source snippet for confirmation.</p></section>
        <section><h2 className="font-serif text-xl font-semibold text-foreground">Where and why</h2><p className="mt-2">The application refuses document intake unless its deployment has a provider that declares encrypted storage in India, no use of client documents for training, and atomic deletion of the document, extraction draft, and source snippets. The data is used only to prepare the confirmation screen and the resulting deterministic computation.</p></section>
        <section><h2 className="font-serif text-xl font-semibold text-foreground">How long</h2><p className="mt-2">You choose either compute-and-delete or 30-day retention. Compute-and-delete removes the document and every snippet after a successful confirmed computation. The 30-day option sets a deletion deadline; you can delete earlier at any time. A protected scheduled operation processes expired documents.</p></section>
        <section><h2 className="font-serif text-xl font-semibold text-foreground">What remains in the audit</h2><p className="mt-2">After you confirm the fields, the immutable matter audit may retain those confirmed values, the extraction model version, the legal ruleset hash, citations, output, time, and firm member identity. It does not retain the uploaded document, proposed values, or verbatim source snippets.</p></section>
        <section><h2 className="font-serif text-xl font-semibold text-foreground">Access and deletion</h2><p className="mt-2">Document jobs are scoped to an authenticated firm membership. Use “Delete document now” in Document Check to remove active provider state. Contact the administrator of your StampDraft deployment for account access, correction, or other data-principal requests.</p></section>
      </div>
    </article>
  );
}
