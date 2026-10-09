import os
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from PIL import Image, ImageDraw

def generate_pdf_samples():
    output_dir = os.path.join(os.path.dirname(__file__), "samples")
    os.makedirs(output_dir, exist_ok=True)
    styles = getSampleStyleSheet()

    # 1. Lipid Profile PDF (Searchable Digital Text)
    lipid_pdf_path = os.path.join(output_dir, "sample_lipid_report.pdf")
    doc = SimpleDocTemplate(lipid_pdf_path, pagesize=letter, leftMargin=40, rightMargin=40, topMargin=40, bottomMargin=40)
    story = []
    
    title_style = ParagraphStyle('TitleStyle', parent=styles['Heading1'], fontSize=16, textColor=colors.HexColor('#0f766e'), spaceAfter=10)
    sub_style = ParagraphStyle('SubStyle', parent=styles['Normal'], fontSize=10, textColor=colors.HexColor('#334155'), spaceAfter=6)
    
    story.append(Paragraph("METROPOLIS CLINICAL LABORATORIES", title_style))
    story.append(Paragraph("Patient: Alex Johnson | Age: 35 / Male | Date: 2026-06-15 | ID: MET-89231", sub_style))
    story.append(Paragraph("Ref By: Dr. R. Sharma, MD | Test Category: Comprehensive Lipid Profile Panel", sub_style))
    story.append(Spacer(1, 15))
    
    table_data = [
        ["Biomarker / Test Name", "Observed Value", "Unit", "Biological Reference Interval", "Status Flag"],
        ["Total Cholesterol", "248.0", "mg/dL", "< 200.0 (Desirable)", "High"],
        ["HDL Cholesterol (Good)", "34.5", "mg/dL", "> 40.0 (Optimal)", "Low"],
        ["LDL Cholesterol (Bad)", "168.2", "mg/dL", "< 100.0 (Optimal)", "High"],
        ["Triglycerides", "215.0", "mg/dL", "< 150.0 (Normal)", "High"],
        ["VLDL Cholesterol", "43.0", "mg/dL", "5.0 - 30.0", "High"],
        ["Total / HDL Ratio", "7.18", "Ratio", "3.3 - 4.4", "High"]
    ]
    t = Table(table_data, colWidths=[170, 90, 60, 140, 70])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#0f766e')),
        ('TEXTCOLOR', (0,0), (-1,0), colors.whitesmoke),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#cbd5e1')),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor('#f8fafc')]),
        ('FONTSIZE', (0,0), (-1,-1), 9),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(t)
    story.append(Spacer(1, 15))
    story.append(Paragraph("<b>CLINICAL NOTES:</b> Serum reveals dyslipidemia with elevated LDL-C and hypertriglyceridemia. Consult cardiologist.", sub_style))
    doc.build(story)
    print(f"Generated text PDF: {lipid_pdf_path}")

    # 2. CBC PDF (Searchable Digital Text)
    cbc_pdf_path = os.path.join(output_dir, "sample_cbc_report.pdf")
    doc_cbc = SimpleDocTemplate(cbc_pdf_path, pagesize=letter, leftMargin=40, rightMargin=40, topMargin=40, bottomMargin=40)
    story_cbc = []
    
    story_cbc.append(Paragraph("APEX DIAGNOSTICS & RESEARCH CENTER", title_style))
    story_cbc.append(Paragraph("Patient: Alex Johnson | Age: 35 / Male | Date: 2026-06-20 | Lab ID: APX-9941", sub_style))
    story_cbc.append(Paragraph("Test Name: Complete Blood Count (CBC) with Differential", sub_style))
    story_cbc.append(Spacer(1, 15))
    
    cbc_data = [
        ["Biomarker / Test Name", "Observed Value", "Unit", "Biological Reference Interval", "Status Flag"],
        ["Hemoglobin (Hb)", "10.8", "g/dL", "13.5 - 17.5", "Low"],
        ["Total Leukocyte Count (WBC)", "7200", "cells/mcL", "4500 - 11000", "Normal"],
        ["Red Blood Cell (RBC) Count", "3.65", "mil/mcL", "4.50 - 5.90", "Low"],
        ["Packed Cell Volume (PCV)", "33.2", "%", "40.0 - 50.0", "Low"],
        ["Mean Corpuscular Volume (MCV)", "72.4", "fL", "80.0 - 96.0", "Low"],
        ["Mean Corpuscular Hb (MCH)", "23.5", "pg", "27.0 - 33.0", "Low"],
        ["MCHC", "31.2", "g/dL", "32.0 - 36.0", "Low"],
        ["Platelet Count", "240000", "cells/mcL", "150000 - 450000", "Normal"],
        ["Neutrophils", "64", "%", "40 - 70", "Normal"],
        ["Lymphocytes", "28", "%", "20 - 40", "Normal"]
    ]
    t_cbc = Table(cbc_data, colWidths=[170, 90, 60, 140, 70])
    t_cbc.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#0f766e')),
        ('TEXTCOLOR', (0,0), (-1,0), colors.whitesmoke),
        ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#cbd5e1')),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor('#f8fafc')]),
        ('FONTSIZE', (0,0), (-1,-1), 9),
        ('BOTTOMPADDING', (0,0), (-1,-1), 5),
    ]))
    story_cbc.append(t_cbc)
    story_cbc.append(Spacer(1, 15))
    story_cbc.append(Paragraph("<b>CLINICAL NOTES:</b> Microcytic hypochromic indices suggestive of iron deficiency anemia.", sub_style))
    doc_cbc.build(story_cbc)
    print(f"Generated text PDF: {cbc_pdf_path}")

if __name__ == "__main__":
    generate_pdf_samples()
