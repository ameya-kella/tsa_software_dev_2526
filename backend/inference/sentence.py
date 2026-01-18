from transformers import AutoTokenizer, AutoModelForSeq2SeqLM
import torch

# -------------------------
# Load Flan-T5 model (large for better performance)
# -------------------------
tokenizer = AutoTokenizer.from_pretrained("google/flan-t5-large", local_files_only=True)
model = AutoModelForSeq2SeqLM.from_pretrained("google/flan-t5-large", local_files_only=True)

def generate_sentence_from_words(recognized_words):
    if not recognized_words:
        return "Waiting for input..."
    
    # Remove any "TV" words if present
    words = [w for w in recognized_words if w != "TV"]
    input_text = f"""
            Objective:
            You have developed an isolated American Sign Language (ASL) word recognition model. At the end of each run, the model stores the recognized words in a list. However, the words may not necessarily be in the correct order. Your objective is to utilize these recognized words to construct a coherent and meaningful English sentence. The resulting sentence should be as simple as possible while still accurately conveying the intended meaning.

            Instructions:

            - Input: You will be provided with a Python list containing the recognized ASL words from your model. The contents of this list may vary depending on the output of your model.
            - Processing: Rearrange the words in the list to form a grammatically correct and logically valid English sentence. Take into consideration the context and logical flow of the sentence. Always ignore the word "TV".
            - Output: Generate a concise English sentence that accurately conveys the meaning of the recognized ASL words.

            Considerations:

            - Simplicity: Aim for simplicity in your sentence structure and vocabulary.
            - Clarity: Ensure that the sentence is clear and understandable.
            - Relevance: The sentence should reflect the meaning conveyed by the ASL words.
            - Grammar: Maintain proper grammar, syntax, and punctuation in the sentence. Default to present tense unless other hints are given.

            Example:

            Input: recognized_words = grandpa ride boat tomorrow
            output: Grandpa will ride the boat tomorrow.

            Here is the actual input for which you have to produce the relevant output: {" ".join(words)}
            """
    
    inputs = tokenizer(input_text, return_tensors="pt")
    with torch.no_grad():
        outputs = model.generate(**inputs, max_new_tokens=50)
    sentence = tokenizer.decode(outputs[0], skip_special_tokens=True)
    return sentence
