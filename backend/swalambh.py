from dotenv import load_dotenv
import os

load_dotenv()
import os
import streamlit as st
from PyPDF2 import PdfReader
from langchain_core.prompts import PromptTemplate
from langchain_classic.chains import RetrievalQA
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_community.vectorstores import FAISS
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_groq import ChatGroq 
import speech_recognition as sr
import pyttsx3 
import threading
import torch
from transformers import ViTForImageClassification, ViTImageProcessor
from PIL import Image
import numpy as np
MODEL_PATH = r"D:\Internship (Riverstream)\RAG(Medical chatbot)\best_small_model"



DB_FAISS_PATH = "vectorstore/db_faiss"
PDF_PATH = r"D:\Internship (Riverstream)\RAG(Medical chatbot)\Dermatology.pdf"

@st.cache_resource
def load_ml_model():
    model = ViTForImageClassification.from_pretrained(MODEL_PATH)
    processor = ViTImageProcessor.from_pretrained(MODEL_PATH)
    model.eval()
    return model, processor

@st.cache_resource
def vector():
    embeddings = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")
    index_file = os.path.join(DB_FAISS_PATH, "index.faiss")
    pkl_file = os.path.join(DB_FAISS_PATH, "index.pkl")

    if os.path.exists(index_file) and os.path.exists(pkl_file):
        return FAISS.load_local(DB_FAISS_PATH, embeddings, allow_dangerous_deserialization=True)
    else:
        pdf_reader = PdfReader(PDF_PATH)
        docs = []
        splitter = RecursiveCharacterTextSplitter(chunk_size=1500, chunk_overlap=150)
        for i, page in enumerate(pdf_reader.pages):
            page_text = page.extract_text()
            if page_text:
                chunks = splitter.split_text(page_text)
                for chunk in chunks:
                    docs.append({
                        "page_content": chunk
                    })
        texts = [doc["page_content"] for doc in docs]
        vectorstore = FAISS.from_texts(texts, embeddings)
        vectorstore.save_local(DB_FAISS_PATH)
        return vectorstore 

def get_voice_input():
    r = sr.Recognizer()
    with sr.Microphone() as source:
        st.info("Listening... Speak now")
        audio = r.listen(source, phrase_time_limit=5)
    try:
        query = r.recognize_google(audio)
        st.success(f"You said: {query}")
        return query
    except:
        st.error("Sorry, couldn't understand your voice.")
        return ""

def speak_text(text):
    engine = pyttsx3.init()
    engine.say(text)
    engine.runAndWait()

def load_llm():
    return ChatGroq(
        model="llama-3.3-70b-versatile",  
        temperature=0.5,
    )

def context_history(chat):
    history = chat[-3:]
    context = ""
    for i in history:
        context += f"User: {i['question']}\nAssistant: {i['answer']}\n"
    return context

def main():
    st.title("DermaAI: Intelligent Skin Disease Diagnosis System")

    if "chat_history" not in st.session_state:
        st.session_state.chat_history = []

    if "ml_prediction" not in st.session_state:
        st.session_state.ml_prediction = None

    active_chat = st.session_state.chat_history

    for message in active_chat:
        with st.chat_message("user"):
            st.markdown(message["question"])
        with st.chat_message("assistant"):
            st.markdown(message["answer"])

    vector_store = vector()
    llm = load_llm()

    prompt_template = PromptTemplate(
        input_variables=["context", "question"],
        template="""You are a skin disease doctor assistant.
Answer strictly based on the provided context.

Context:
{context}

Question:
{question}

Answer:"""
    )

    qa_chain = RetrievalQA.from_chain_type(
        llm=llm,
        retriever=vector_store.as_retriever(search_kwargs={"k": 3}),
        chain_type="stuff",
        chain_type_kwargs={"prompt": prompt_template},
        return_source_documents=True
    )

    model, processor = load_ml_model()

    uploaded_file = st.file_uploader("Upload Skin Image", type=["jpg", "png", "jpeg"])

    if uploaded_file is not None:
        image = Image.open(uploaded_file).convert("RGB")
        st.image(image, caption="Uploaded Image", use_container_width=True)

        inputs = processor(images=image, return_tensors="pt")

        with torch.no_grad():
            outputs = model(**inputs)

        logits = outputs.logits
        predicted_class_idx = torch.argmax(logits, dim=1).item()
        predicted_label = model.config.id2label[predicted_class_idx]
        confidence = torch.softmax(logits, dim=1)[0][predicted_class_idx].item()

        st.session_state.ml_prediction = {
            "label": predicted_label,
            "confidence": confidence
        }

        st.warning("Enter your symptoms below for detailed analysis.")

    question = ""

    if st.button("Speak"):
        question = get_voice_input()

    text_input = st.chat_input("Type your symptoms or questions here:")
    if text_input:
        question = text_input

    if question:
        with st.chat_message("user"):
            st.markdown(question)

        previous_context = context_history(active_chat)

        if st.session_state.ml_prediction is not None:
            predicted_label = st.session_state.ml_prediction["label"]
            confidence = st.session_state.ml_prediction["confidence"]

            final_query = f"""
Previous Conversation:
{previous_context}

Image-based predicted disease: {predicted_label}
Model confidence: {confidence:.2f}

Current User Input:
{question}

Provide medical explanation including:
- Whether symptoms match prediction
- Causes
- Treatment
- Prevention

Use only dermatology knowledge base context.
"""
        else:
            final_query = f"""
Previous Conversation:
{previous_context}

Current User Input:
{question}
"""

        with st.spinner("Analyzing..."):
            result = qa_chain.invoke({"query": final_query})
            answer = result["result"]

        with st.chat_message("assistant"):
            st.markdown(answer)
            threading.Thread(target=speak_text, args=(answer,)).start()

        active_chat.append({
            "question": question,
            "answer": answer,
        })


if __name__ == "__main__":
    main()
