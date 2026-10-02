alter table public.practitioners
    add constraint practitioners_name_check
    CHECK (name ~ '[^[:space:]]');

alter table public.practitioners
    validate constraint practitioners_name_check;

alter table public.practitioner_contacts
    add constraint contacts_email_check
    CHECK (contact_email ~ '[^[:space:]]');
    
alter table public.practitioner_contacts
    validate constraint contacts_email_check;