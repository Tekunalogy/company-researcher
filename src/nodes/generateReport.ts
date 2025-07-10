import { geminiClient } from '../clients/geminiClient.js';
import { CompanyResearchState } from '../state.js';
import { generatedReportSchema } from '../schema.js';
import { BaseLanguageModelInput } from '@langchain/core/language_models/base';
import { Runnable } from '@langchain/core/runnables';
import { HumanMessage } from '@langchain/core/messages'; // <--- Add this import!
import { z } from 'zod';

// Define the base template for initial report generation
// Removed leading spaces on each line to prevent accidental placeholder mismatches
const GENERATE_REPORT_PROMPT_TEMPLATE = `You are a helpful assistant and an expert at company market research.
Below, you are provided data extracted from the company's website: {COMPANY_URL}. Use this data to generate a useful report that provides a complete overview of the company including it's mission, key persons, products, clients, competitors, and other relevant market research info for accurate prospecting.

RULES: 
- Your final report MUST include a summary of company's market position and a concise overview diagram of the company's structure and market position in mermaid format.
- Your report MUST be in JSON format.

EXTRACTED DATA:
{EXTRACTED_DATA}
{SEARCH_RESULTS_SECTION}`;

// Define the template for revising an existing report
// Removed leading spaces on each line to prevent accidental placeholder mismatches
const REVISION_PROMPT_TEMPLATE = `You are a helpful assistant and an expert at market research. Below, you are provided with extracted data about a company and your recent generated report based on this data.

Please revise and edit the generated report as per the user's instructions below:
<REVISION INSTRUCTIONS>
 {REVISION_INSTRUCTIONS}
</REVISION INSTRUCTIONS>

If the user's prompt is not clear or is unrelated to revising the report, please ignore the revision request and return the original report.

Your revised report MUST be in JSON format.

{RECENT_REPORT}

Original extracted data used to generate the report:
{EXTRACTED_DATA}
{SEARCH_RESULTS_SECTION}`;

// --- Debugging: Log raw template strings to expose any hidden characters or exact formatting ---
console.log('GENERATE_REPORT_PROMPT_TEMPLATE (raw):', JSON.stringify(GENERATE_REPORT_PROMPT_TEMPLATE));
console.log('REVISION_PROMPT_TEMPLATE (raw):', JSON.stringify(REVISION_PROMPT_TEMPLATE));
// --- End Debugging ---

export async function generateReportNode(
  state: CompanyResearchState
): Promise<Partial<CompanyResearchState>> {
  const extractedData = state.crawledData;
  const fallbackSearchResults = state.fallbackSearchKeyPersons;
  const userPrompt = state.userPrompt?.trim();
  const recentGeneratedReport = state.finalReport; // This should be the JSON string

  const llm = geminiClient.withStructuredOutput(generatedReportSchema);

  let isRevision = false;
  let revisionIncrement = 0;
  let prompt: string; // Declare prompt here

  // Prepare common data that will be used in both prompt types
  const commonReplacements = {
    COMPANY_URL: state.userUrl,
    EXTRACTED_DATA: JSON.stringify(extractedData, null, 2),
    // Construct the entire SEARCH_RESULTS_SECTION. If no results, it's an empty string.
    SEARCH_RESULTS_SECTION:
      fallbackSearchResults && fallbackSearchResults.length > 0
        ? `\n\nADDITIONAL DATA FETCHED FROM THE WEB ABOUT THE COMPANY:\n${JSON.stringify(
            fallbackSearchResults,
            null,
            2
          )}`
        : '', // Ensures the placeholder is replaced with an empty string if no data
  };

  if (userPrompt && userPrompt !== '') {
    isRevision = true;
    revisionIncrement = 1;

    // Build the revision prompt
    prompt = REVISION_PROMPT_TEMPLATE.replace(
      '{REVISION_INSTRUCTIONS}', // Use the new, clear placeholder name
      userPrompt
    )
      .replace(
        '{RECENT_REPORT}', // Use the new, clear placeholder name
        `Below is your most recent generated report revision the user would like to change:\n${recentGeneratedReport}`
      )
      .replace('{EXTRACTED_DATA}', commonReplacements.EXTRACTED_DATA)
      .replace('{SEARCH_RESULTS_SECTION}', commonReplacements.SEARCH_RESULTS_SECTION);
  } else {
    // Build the initial generation prompt
    prompt = GENERATE_REPORT_PROMPT_TEMPLATE.replace(
      '{COMPANY_URL}',
      commonReplacements.COMPANY_URL
    )
      .replace('{EXTRACTED_DATA}', commonReplacements.EXTRACTED_DATA)
      .replace('{SEARCH_RESULTS_SECTION}', commonReplacements.SEARCH_RESULTS_SECTION);
  }

  // --- REFINED OR REMOVED DEBUGGING CHECK ---
  // The previous check was too broad and flagged valid JSON as unreplaced placeholders.
  // We are removing this problematic check.
  // If you want a placeholder check, it should be highly specific, e.g., using regex
  // to look for the exact template string pattern like /\{[A-Z_]+\}/g.
  // For now, removing it is the best step as the JSON output is correct.
  // --- End Debugging Check ---

  console.log('generation prompt (raw, final):', JSON.stringify(prompt)); // Log the final prompt string
  console.log('isRevision', isRevision);

  const finalReport = await generateFinalReport(llm, prompt);
  console.log('finalReport (object from LLM):', finalReport);

  // Ensure finalReport is stringified if it's an object from structured output
  const finalReportJson = JSON.stringify(finalReport, null, 2); // Pretty print for readability

  return {
    finalReport: finalReportJson,
    reportRevisionsIncrement: revisionIncrement,
    // Conditionally update or initialize reportRevisions array
    reportRevisions: isRevision
      ? (state.reportRevisions || []).concat([finalReportJson])
      : [finalReportJson], // For initial report, start a new array
  };
}

async function generateFinalReport(
  llm: Runnable<BaseLanguageModelInput, z.infer<typeof generatedReportSchema>>,
  prompt: string // Original prompt is passed here
) {
  // Use the actual prompt, but send it as a HumanMessage
  console.log('--- Attempting LLM call with HumanMessage ---');
  console.log('Prompt sent to LLM (as HumanMessage):', JSON.stringify(prompt));

  try {
    // CHANGE THIS LINE:
    const result = await llm.invoke([new HumanMessage(prompt)]); // <--- Changed SystemMessage to HumanMessage

    console.log('LLM call successful! Result:', result);
    return result;
  } catch (error) {
    console.error('Error during LLM call:', error);
    throw error; // Re-throw the error to keep seeing the stack trace if it persists
  }
}
